import { Queue, Worker, type ConnectionOptions, type Job } from 'bullmq';
import type { Logger } from '../lib/logger.js';
import type { MetricsRegistry } from '../lib/metrics.js';
import type { EmailMessage } from './mailer.js';

/**
 * Every background job, with its payload type. Payloads are plain JSON: they go through
 * Redis (BullMQ) or the outbox table, so they hold ids, never live objects.
 */
export interface JobPayloads {
  'email.send': EmailMessage;
  /** (Re)compute the embedding for one piece of content. */
  'search.index': { kind: 'question' | 'answer' | 'snippet'; id: string };
  /** Periodic sweep that indexes anything missing or stale (self-healing). */
  'search.reconcile': Record<string, never>;
  /** Notify participants shortly before a scheduled session starts. */
  'session.reminder': { sessionId: string };
  /** AI triage of a user report (prioritises the moderation queue). */
  'moderation.triage': { reportId: string };
  /** Purge expired tokens and old outbox rows. */
  'maintenance.cleanup': Record<string, never>;
}
export type JobName = keyof JobPayloads;
export type JobHandlers = { [K in JobName]: (data: JobPayloads[K]) => Promise<void> };

export interface JobOptions {
  /** Run no earlier than this many ms from now. */
  delayMs?: number;
  /** Idempotency key: a second add with the same id is ignored while the first is retained. */
  jobId?: string;
}

/** Producer side of the queue (Strategy: BullMQ in production, in-process for tests/dev). */
export interface JobQueue {
  readonly kind: 'bullmq' | 'inline';
  add<K extends JobName>(name: K, data: JobPayloads[K], opts?: JobOptions): Promise<void>;
  /** Register a repeating job. Deduplicated across replicas by its name. */
  every(name: JobName, ms: number): Promise<void>;
  /** Start consuming (a replica can produce without consuming). */
  startWorker(): void;
  close(): Promise<void>;
}

const ATTEMPTS = 5;

/**
 * BullMQ reserves ':' in custom job ids (it is its key separator). Both queue implementations
 * enforce the rule, so tests on the in-process queue catch ids production would reject.
 */
function assertJobId(id: string | undefined): void {
  if (id?.includes(':')) throw new Error(`Job id must not contain ':' (got "${id}")`);
}
const backoffMs = (attempt: number) => Math.min(30_000, 1_000 * 2 ** (attempt - 1));

async function runInstrumented<K extends JobName>(
  handlers: JobHandlers,
  name: K,
  data: JobPayloads[K],
  metrics: MetricsRegistry,
): Promise<void> {
  const started = performance.now();
  try {
    await handlers[name](data);
    metrics.jobs.inc({ name, outcome: 'ok' });
  } catch (err) {
    metrics.jobs.inc({ name, outcome: 'error' });
    throw err;
  } finally {
    metrics.jobDuration.observe({ name }, (performance.now() - started) / 1000);
  }
}

/**
 * BullMQ over Redis. Every API replica can be a worker (competing consumers): a job is
 * leased by exactly one of them; a crashed worker's lease expires and another picks it up.
 * Failed jobs retry with exponential backoff; after the last attempt they stay in the
 * "failed" set, which acts as the dead-letter queue (inspectable, re-drivable).
 */
export class BullJobQueue implements JobQueue {
  readonly kind = 'bullmq';
  private readonly queue: Queue;
  private worker: Worker | null = null;

  constructor(
    private readonly connection: ConnectionOptions,
    private readonly handlers: JobHandlers,
    private readonly logger: Logger,
    private readonly metrics: MetricsRegistry,
    private readonly name = 'devhub',
  ) {
    this.queue = new Queue(name, {
      connection,
      prefix: 'devhub:bull',
      defaultJobOptions: {
        attempts: ATTEMPTS,
        backoff: { type: 'exponential', delay: 1_000 },
        // Keep completed jobs a day so a re-sent outbox row (same jobId) is still deduplicated.
        removeOnComplete: { age: 86_400, count: 5_000 },
        removeOnFail: { age: 7 * 86_400 },
      },
    });
    this.queue.on('error', (err) => this.logger.warn({ err: err.message }, 'queue error'));
  }

  async add<K extends JobName>(name: K, data: JobPayloads[K], opts: JobOptions = {}) {
    assertJobId(opts.jobId);
    await this.queue.add(name, data, {
      ...(opts.jobId && { jobId: opts.jobId }),
      ...(opts.delayMs && { delay: opts.delayMs }),
    });
  }

  async every(name: JobName, ms: number) {
    await this.queue.upsertJobScheduler(name, { every: ms }, { name, data: {} });
  }

  startWorker(): void {
    if (this.worker) return;
    this.worker = new Worker(
      this.name,
      (job: Job) => runInstrumented(this.handlers, job.name as JobName, job.data, this.metrics),
      { connection: this.connection, prefix: 'devhub:bull', concurrency: 4 },
    );
    this.worker.on('failed', (job, err) =>
      this.logger.warn(
        { job: job?.name, id: job?.id, attempt: job?.attemptsMade, err: err.message },
        'job failed',
      ),
    );
    this.worker.on('error', (err) => this.logger.warn({ err: err.message }, 'worker error'));
  }

  async close() {
    await this.worker?.close();
    await this.queue.close();
  }
}

/**
 * Single-process queue with the same semantics (async, retries with backoff, idempotent
 * job ids, delays). Used without Redis and in tests, where `drain()` waits for quiescence.
 */
export class InlineJobQueue implements JobQueue {
  readonly kind = 'inline';
  private readonly pending = new Set<Promise<void>>();
  private readonly seen = new Set<string>();
  private readonly timers = new Set<NodeJS.Timeout>();
  private consuming = false;
  private readonly backlog: (() => void)[] = [];

  constructor(
    private readonly handlers: JobHandlers,
    private readonly logger: Logger,
    private readonly metrics: MetricsRegistry,
    /** Tests use 0 to retry immediately. */
    private readonly retryDelay: (attempt: number) => number = backoffMs,
  ) {}

  async add<K extends JobName>(name: K, data: JobPayloads[K], opts: JobOptions = {}) {
    assertJobId(opts.jobId);
    if (opts.jobId) {
      if (this.seen.has(opts.jobId)) return;
      this.seen.add(opts.jobId);
    }
    const start = () => this.track(this.run(name, data, 1));
    if (opts.delayMs) {
      const t = setTimeout(() => {
        this.timers.delete(t);
        this.dispatch(start);
      }, opts.delayMs);
      t.unref();
      this.timers.add(t);
    } else {
      this.dispatch(start);
    }
  }

  private dispatch(start: () => void) {
    if (this.consuming) start();
    else this.backlog.push(start);
  }

  private track(p: Promise<void>) {
    this.pending.add(p);
    void p.finally(() => this.pending.delete(p));
  }

  private async run<K extends JobName>(name: K, data: JobPayloads[K], attempt: number) {
    try {
      await runInstrumented(this.handlers, name, data, this.metrics);
    } catch (err) {
      if (attempt >= ATTEMPTS) {
        this.logger.error({ job: name, err }, 'job failed permanently');
        return;
      }
      this.logger.warn({ job: name, attempt, err: (err as Error).message }, 'job failed, retrying');
      await new Promise((r) => setTimeout(r, this.retryDelay(attempt)));
      await this.run(name, data, attempt + 1);
    }
  }

  async every(name: JobName, ms: number) {
    const t = setInterval(() => void this.add(name, {} as never), ms);
    t.unref();
    this.timers.add(t);
  }

  startWorker(): void {
    this.consuming = true;
    for (const start of this.backlog.splice(0)) start();
  }

  /** Resolves when no job is running (including jobs enqueued by jobs). */
  async drain(): Promise<void> {
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }

  async close() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    await this.drain();
  }
}
