import * as Y from 'yjs';
import { DOC_TEXT, REALTIME_LIMITS } from '@devhub/shared';
import type { Logger } from '../lib/logger.js';

export interface DocStore {
  loadDocument(sessionId: string): Promise<{ state: Uint8Array | null; code: string } | null>;
  /** Merges (never overwrites) the update into the stored state; returns the merged state. */
  mergeDocument(sessionId: string, update: Uint8Array): Promise<Uint8Array>;
}

/**
 * Normalises a binary payload. Socket.IO delivers Buffers, but anything relayed through the
 * Redis adapter's msgpack encoding may arrive as an ArrayBuffer, a number array or a
 * serialised Buffer object. Getting this wrong silently corrupts CRDT updates.
 */
export function toBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value)) return Uint8Array.from(value as number[]);
  const data = (value as { data?: unknown } | null)?.data;
  if (Array.isArray(data)) return Uint8Array.from(data as number[]);
  throw new TypeError('Expected binary data');
}

interface Entry {
  doc: Y.Doc;
  /** Running estimate of the encoded document size; recalibrated on every flush. */
  bytes: number;
  /** Sockets on this instance currently editing the document. */
  refs: number;
  dirty: boolean;
  timer: NodeJS.Timeout | null;
}

export { DOC_TEXT };

/**
 * Holds one Yjs document per active session in memory.
 *
 * - Loaded lazily from Postgres (CRDT state, or seeded from the plain-text snapshot).
 * - Updates are CRDT-merged, so they can be applied in any order and duplicates are harmless;
 *   this is what lets several API instances each keep a copy (see ADR 0003).
 * - Persistence is debounced (a save happens after a quiet period) and *merging*: the store
 *   CRDT-merges this copy into the database row under a lock and hands back the merged
 *   state, which is applied here so every instance converges even if a relay was lost.
 * - The doc is flushed and evicted when the last local editor leaves.
 */
/** Observes document changes (session replay). */
export interface DocObserver {
  /** The document was loaded on this instance; `state` is everything it contains. */
  loaded(sessionId: string, state: Uint8Array): void;
  /** A local client changed the document; `diff` is exactly what was newly integrated. */
  changed(sessionId: string, userId: string, diff: Uint8Array): void;
}

const CLIENT = Symbol('client-update');

export class DocManager {
  private readonly docs = new Map<string, Entry>();
  private readonly loading = new Map<string, Promise<Entry>>();
  private observer: DocObserver | null = null;

  constructor(
    private readonly store: DocStore,
    private readonly logger: Logger,
    private readonly debounceMs = 2_000,
  ) {}

  observe(observer: DocObserver): void {
    this.observer = observer;
  }

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
        this.observer?.loaded(sessionId, Y.encodeStateAsUpdate(doc));
        // Yjs reports the *effective* diff of each applied update: a client re-sending its
        // full state on reconnect produces no event, so replay only stores real edits.
        doc.on('update', (diff: Uint8Array, origin: unknown) => {
          if (typeof origin === 'object' && origin !== null && CLIENT in origin)
            this.observer?.changed(sessionId, (origin as { [CLIENT]: string })[CLIENT], diff);
        });
        const entry: Entry = {
          doc,
          bytes: saved?.state?.byteLength ?? 0,
          refs: 0,
          dirty: false,
          timer: null,
        };
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
  applyUpdate(sessionId: string, update: Uint8Array, userId = 'unknown'): boolean {
    const entry = this.docs.get(sessionId);
    if (!entry || update.byteLength > REALTIME_LIMITS.maxDocUpdateBytes) return false;
    if (entry.bytes + update.byteLength > REALTIME_LIMITS.maxDocBytes) return false;
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
      Y.applyUpdate(entry.doc, update, { [CLIENT]: userId });
      entry.bytes += update.byteLength;
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
      entry.bytes += update.byteLength;
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
      const merged = await this.store.mergeDocument(sessionId, Y.encodeStateAsUpdate(entry.doc));
      Y.applyUpdate(entry.doc, merged, 'persistence'); // catch up with other instances' edits
      entry.bytes = merged.byteLength;
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
