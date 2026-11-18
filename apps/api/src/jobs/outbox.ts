import type { Prisma } from '@prisma/client';
import type { Db, Tx } from '../lib/prisma.js';
import type { Logger } from '../lib/logger.js';
import type { JobName, JobPayloads, JobQueue } from './queue.js';

interface OutboxRow {
  id: string;
  topic: string;
  payload: unknown;
  availableAt: Date;
}

/**
 * Transactional outbox.
 *
 * Problem: "create the user, then enqueue the verification email" has a gap. If the process
 * dies between the commit and the enqueue, or Redis is down, the email is silently lost; if
 * we enqueue first and the transaction rolls back, we email someone who has no account.
 *
 * Fix: write the job as a row in the same transaction as the change (`add(tx, …)`). A relay
 * later moves committed rows to the queue. Delivery is at-least-once; the outbox row id is
 * used as the queue job id, so a row relayed twice (crash after enqueue, before marking it)
 * is deduplicated by the queue.
 *
 * Several replicas can relay at once: rows are claimed with FOR UPDATE SKIP LOCKED, so each
 * row is handled by one relay and nobody waits on another's lock.
 */
export class Outbox {
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<number> | null = null;

  constructor(
    private readonly db: Db,
    private readonly queue: JobQueue,
    private readonly logger: Logger,
  ) {}

  /** Records a job inside the caller's transaction. */
  async add<K extends JobName>(
    tx: Tx,
    topic: K,
    payload: JobPayloads[K],
    opts: { availableAt?: Date } = {},
  ): Promise<void> {
    await tx.outboxEvent.create({
      data: {
        topic,
        payload: payload as Prisma.InputJsonValue,
        ...(opts.availableAt && { availableAt: opts.availableAt }),
      },
    });
  }

  /** Relays one batch. Returns the number of rows dispatched. */
  async relayOnce(batch = 50): Promise<number> {
    return this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<OutboxRow[]>`
        SELECT id, topic, payload, "availableAt" FROM outbox
        WHERE "dispatchedAt" IS NULL AND "availableAt" <= now() + interval '1 hour'
        ORDER BY "availableAt"
        LIMIT ${batch}
        FOR UPDATE SKIP LOCKED`;
      if (!rows.length) return 0;

      const done: string[] = [];
      for (const row of rows) {
        try {
          // Rows due within the hour go to the queue as delayed jobs (cheap, precise timing);
          // later ones wait in the table, so far-future reminders do not sit in Redis.
          const delayMs = Math.max(0, row.availableAt.getTime() - Date.now());
          await this.queue.add(row.topic as JobName, row.payload as never, {
            jobId: `outbox-${row.id}`,
            ...(delayMs > 0 && { delayMs }),
          });
          done.push(row.id);
        } catch (err) {
          // Back off (quadratic, capped at 5 min) so a poison row cannot hot-loop the relay.
          await tx.$executeRaw`
            UPDATE outbox SET attempts = attempts + 1, "lastError" = ${String((err as Error).message)},
              "availableAt" = now() + make_interval(secs => LEAST(300, (attempts + 1) * (attempts + 1)))
            WHERE id = ${row.id}`;
        }
      }
      if (done.length) {
        await tx.outboxEvent.updateMany({
          where: { id: { in: done } },
          data: { dispatchedAt: new Date() },
        });
      }
      return done.length;
    });
  }

  /** Relays until the table has nothing due (used by tests and on shutdown). */
  async flush(): Promise<void> {
    while ((await this.relayOnce()) > 0) {
      /* keep going */
    }
  }

  /**
   * Polls every `intervalMs`; `poke()` triggers an immediate pass after a commit so emails
   * go out in milliseconds rather than on the next tick.
   */
  start(intervalMs = 2_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.poke(), intervalMs);
    this.timer.unref();
  }

  poke(): void {
    if (this.running) return;
    this.running = this.relayOnce()
      .catch((err) => {
        this.logger.warn({ err: (err as Error).message }, 'outbox relay failed');
        return 0;
      })
      .finally(() => {
        this.running = null;
      });
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.running;
  }

  /** Deletes relayed rows older than `days`. */
  async prune(days = 7): Promise<number> {
    const { count } = await this.db.outboxEvent.deleteMany({
      where: { dispatchedAt: { lt: new Date(Date.now() - days * 86_400_000) } },
    });
    return count;
  }
}
