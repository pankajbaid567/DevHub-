import * as Y from 'yjs';
import type { ReplayUpdateDto } from '@devhub/shared';

/** Gaps longer than this are compressed in playback ("idle time skipped"). */
export const MAX_GAP_MS = 2_000;
const CHECKPOINT_EVERY = 200;

export interface Timeline {
  updates: Uint8Array[];
  /** Real timestamps (ms since epoch). */
  times: number[];
  /** Playback timestamps (ms from start, with idle gaps capped). */
  virtual: number[];
  duration: number;
  authors: (string | null)[];
}

export function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function buildTimeline(items: ReplayUpdateDto[]): Timeline {
  const times = items.map((i) => Date.parse(i.t));
  const virtual: number[] = [];
  let v = 0;
  times.forEach((t, i) => {
    if (i > 0) v += Math.min(MAX_GAP_MS, Math.max(0, t - times[i - 1]!));
    virtual.push(v);
  });
  return {
    updates: items.map((i) => decodeBase64(i.update)),
    times,
    virtual,
    duration: v,
    authors: items.map((i) => i.userId),
  };
}

/** Index of the last update at or before playback time `ms` (-1 before the first). */
export function indexAt(t: Timeline, ms: number): number {
  let lo = 0;
  let hi = t.virtual.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (t.virtual[mid]! <= ms) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/**
 * Rebuilds the document at any update index. Snapshots every 200 updates turn seeking into
 * "restore the nearest snapshot, apply at most 199 updates" instead of replaying from zero.
 */
export class ReplayDoc {
  private readonly checkpoints = new Map<number, Uint8Array>();

  constructor(private readonly t: Timeline) {
    const doc = new Y.Doc();
    t.updates.forEach((u, i) => {
      Y.applyUpdate(doc, u);
      if ((i + 1) % CHECKPOINT_EVERY === 0) this.checkpoints.set(i, Y.encodeStateAsUpdate(doc));
    });
    doc.destroy();
  }

  /** A fresh Y.Doc containing updates[0..index]. The caller destroys it. */
  at(index: number): Y.Doc {
    const doc = new Y.Doc();
    if (index < 0) return doc;
    let start = 0;
    const cp = Math.floor((index + 1) / CHECKPOINT_EVERY) * CHECKPOINT_EVERY - 1;
    if (cp >= 0 && this.checkpoints.has(cp)) {
      Y.applyUpdate(doc, this.checkpoints.get(cp)!);
      start = cp + 1;
    }
    for (let i = start; i <= index; i++) Y.applyUpdate(doc, this.t.updates[i]!);
    return doc;
  }
}
