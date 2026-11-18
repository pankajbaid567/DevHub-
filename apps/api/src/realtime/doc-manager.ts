import * as Y from 'yjs';
import { REALTIME_LIMITS } from '@devhub/shared';
import type { Logger } from '../lib/logger.js';

export interface DocStore {
  loadDocument(sessionId: string): Promise<{ state: Uint8Array | null; code: string } | null>;
  saveDocument(sessionId: string, state: Uint8Array, text: string): Promise<void>;
}

interface Entry {
  doc: Y.Doc;
  /** Sockets on this instance currently editing the document. */
  refs: number;
  dirty: boolean;
  timer: NodeJS.Timeout | null;
}

/** Name of the shared text type inside each session document (the client binds Monaco to it). */
export const DOC_TEXT = 'code';

/**
 * Holds one Yjs document per active session in memory.
 *
 * - Loaded lazily from Postgres (CRDT state, or seeded from the plain-text snapshot).
 * - Updates are CRDT-merged, so they can be applied in any order and duplicates are harmless;
 *   this is what lets several API instances each keep a copy (see ADR 0003).
 * - Persistence is debounced (every edit marks the doc dirty, a save happens after a quiet
 *   period or at most every `maxDelayMs`), and the doc is flushed and evicted when the last
 *   local editor leaves.
 */
export class DocManager {
  private readonly docs = new Map<string, Entry>();
  private readonly loading = new Map<string, Promise<Entry>>();

  constructor(
    private readonly store: DocStore,
    private readonly logger: Logger,
    private readonly debounceMs = 2_000,
  ) {}

  /** Returns the document, loading it once even under concurrent joins. */
  async acquire(sessionId: string): Promise<Y.Doc> {
    const entry = await this.load(sessionId);
    entry.refs += 1;
    return entry.doc;
  }

  private load(sessionId: string): Promise<Entry> {
    const existing = this.docs.get(sessionId);
    if (existing) return Promise.resolve(existing);
    let pending = this.loading.get(sessionId);
    if (!pending) {
      pending = (async () => {
        const doc = new Y.Doc();
        const saved = await this.store.loadDocument(sessionId);
        if (saved?.state) Y.applyUpdate(doc, saved.state);
        else if (saved?.code) doc.getText(DOC_TEXT).insert(0, saved.code);
        const entry: Entry = { doc, refs: 0, dirty: false, timer: null };
        this.docs.set(sessionId, entry);
        this.loading.delete(sessionId);
        return entry;
      })();
      this.loading.set(sessionId, pending);
    }
    return pending;
  }

  stateOf(sessionId: string): Uint8Array {
    const entry = this.docs.get(sessionId);
    return entry ? Y.encodeStateAsUpdate(entry.doc) : new Uint8Array();
  }

  /**
   * Applies a client update. Returns false (and changes nothing) if the update is
   * oversized, malformed, or would grow the document past the size limit.
   */
  applyUpdate(sessionId: string, update: Uint8Array): boolean {
    const entry = this.docs.get(sessionId);
    if (!entry || update.byteLength > REALTIME_LIMITS.maxDocUpdateBytes) return false;
    try {
      // An update cannot insert more characters than it has bytes, so the (O(doc)) probe on a
      // scratch copy is only needed when this update could push the document past the limit.
      const length = entry.doc.getText(DOC_TEXT).length;
      if (length + update.byteLength > REALTIME_LIMITS.maxDocChars) {
        const probe = new Y.Doc();
        Y.applyUpdate(probe, Y.encodeStateAsUpdate(entry.doc));
        Y.applyUpdate(probe, update);
        const tooBig = probe.getText(DOC_TEXT).length > REALTIME_LIMITS.maxDocChars;
        probe.destroy();
        if (tooBig) return false;
      }
      Y.applyUpdate(entry.doc, update);
    } catch (err) {
      this.logger.warn({ err, sessionId }, 'rejected malformed Yjs update');
      return false;
    }
    this.markDirty(sessionId, entry);
    return true;
  }

  /** Applies an update relayed from another API instance (already validated there). */
  applyRemote(sessionId: string, update: Uint8Array): void {
    const entry = this.docs.get(sessionId);
    if (!entry) return; // not loaded here: it will be read from the database when needed
    try {
      Y.applyUpdate(entry.doc, update);
      this.markDirty(sessionId, entry);
    } catch (err) {
      this.logger.warn({ err, sessionId }, 'failed to apply remote update');
    }
  }

  private markDirty(sessionId: string, entry: Entry): void {
    entry.dirty = true;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => void this.flush(sessionId), this.debounceMs);
    entry.timer.unref();
  }

  async flush(sessionId: string): Promise<void> {
    const entry = this.docs.get(sessionId);
    if (!entry?.dirty) return;
    entry.dirty = false;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = null;
    try {
      await this.store.saveDocument(
        sessionId,
        Y.encodeStateAsUpdate(entry.doc),
        entry.doc.getText(DOC_TEXT).toString(),
      );
    } catch (err) {
      entry.dirty = true; // retry on the next flush
      this.logger.error({ err, sessionId }, 'failed to persist session document');
    }
  }

  async release(sessionId: string): Promise<void> {
    const entry = this.docs.get(sessionId);
    if (!entry) return;
    entry.refs = Math.max(0, entry.refs - 1);
    if (entry.refs === 0) {
      await this.flush(sessionId);
      if (entry.refs === 0) {
        entry.doc.destroy();
        this.docs.delete(sessionId);
      }
    }
  }

  /** Flushes everything; called on graceful shutdown. */
  async flushAll(): Promise<void> {
    await Promise.all([...this.docs.keys()].map((id) => this.flush(id)));
  }

  get size(): number {
    return this.docs.size;
  }
}
