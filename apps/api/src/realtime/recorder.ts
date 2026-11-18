import * as Y from 'yjs';
import type { Db } from '../lib/prisma.js';
import type { Logger } from '../lib/logger.js';
import type { DocObserver } from './doc-manager.js';

interface Pending {
  sessionId: string;
  userId: string | null;
  update: Uint8Array;
  at: Date;
}

/** Keystrokes closer together than this (same user) are merged into one row. */
const COALESCE_MS = 300;
const FLUSH_MS = 1_000;
const MAX_ROWS_PER_SESSION = 50_000;

/**
 * Records the edit history of session documents for replay.
 *
 * - Only effective diffs are recorded (see DocManager), and each API instance records only
 *   edits from its own clients, so nothing is stored twice across replicas.
 * - Bursts of typing by one user are merged with `Y.mergeUpdates` (300 ms windows), which
 *   cuts rows by an order of magnitude while keeping replay smooth.
 * - Writes are batched (`createMany` every second) off the hot path; a failed batch is
 *   logged and dropped, because replay is best-effort and must never break live editing.
 */
export class SessionRecorder implements DocObserver {
  private queue: Pending[] = [];
  private readonly counts = new Map<string, number>();
  private timer: NodeJS.Timeout | null = null;
  private flushing: Promise<void> | null = null;

  constructor(
    private readonly db: Db,
    private readonly logger: Logger,
  ) {}

  loaded(sessionId: string, state: Uint8Array): void {
    if (state.byteLength <= 2) return; // empty document
    // Baseline for documents that existed before recording (e.g. seeded sessions): stored
    // only if the session has no history yet. A rare double baseline is harmless (CRDT).
    void this.db.$executeRaw`
      INSERT INTO session_updates ("sessionId", "userId", "update")
      SELECT ${sessionId}, NULL, ${Buffer.from(state)}
      WHERE NOT EXISTS (SELECT 1 FROM session_updates WHERE "sessionId" = ${sessionId})`.catch(
      (err: unknown) => this.logger.warn({ err, sessionId }, 'replay baseline failed'),
    );
  }

  changed(sessionId: string, userId: string, diff: Uint8Array): void {
    const n = this.counts.get(sessionId) ?? 0;
    if (n >= MAX_ROWS_PER_SESSION) return;
    const now = new Date();
    const last = this.queue[this.queue.length - 1];
    if (
      last &&
      last.sessionId === sessionId &&
      last.userId === userId &&
      now.getTime() - last.at.getTime() < COALESCE_MS
    ) {
      last.update = Y.mergeUpdates([last.update, diff]);
      return;
    }
    this.queue.push({ sessionId, userId, update: diff, at: now });
    this.counts.set(sessionId, n + 1);
    this.timer ??= setTimeout(() => void this.flush(), FLUSH_MS);
  }

  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.flushing;
    const batch = this.queue.splice(0);
    if (!batch.length) return;
    this.flushing = this.db.sessionUpdate
      .createMany({
        data: batch.map((p) => ({
          sessionId: p.sessionId,
          userId: p.userId,
          update: Buffer.from(p.update),
          createdAt: p.at,
        })),
      })
      .then(
        () => undefined,
        (err: unknown) =>
          this.logger.warn({ err, rows: batch.length }, 'replay batch dropped (session deleted?)'),
      );
    await this.flushing;
  }
}
