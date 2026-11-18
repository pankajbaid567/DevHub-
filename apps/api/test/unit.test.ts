import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { MemoryCache, cached } from '../src/lib/cache.js';
import { Counter, Histogram } from '../src/lib/metrics.js';
import { policies } from '../src/core/policies.js';
import { excerpt } from '../src/core/mappers.js';
import { EventBus } from '../src/core/events.js';
import { DocManager, DOC_TEXT, toBytes, type DocStore } from '../src/realtime/doc-manager.js';
import { logger } from '../src/lib/logger.js';

describe('MemoryCache', () => {
  it('expires entries and supports set-if-absent', async () => {
    vi.useFakeTimers();
    const cache = new MemoryCache();
    await cache.set('k', { a: 1 }, 1);
    expect(await cache.get('k')).toEqual({ a: 1 });
    expect(await cache.setIfAbsent('once', 10)).toBe(true);
    expect(await cache.setIfAbsent('once', 10)).toBe(false);
    vi.advanceTimersByTime(1_500);
    expect(await cache.get('k')).toBeNull();
    vi.useRealTimers();
  });

  it('bounds memory by evicting the oldest entry', async () => {
    const cache = new MemoryCache(2);
    await cache.set('a', 1, 60);
    await cache.set('b', 2, 60);
    await cache.set('c', 3, 60);
    expect(await cache.get('a')).toBeNull();
    expect(await cache.get('c')).toBe(3);
  });

  it('read-through helper loads once', async () => {
    const cache = new MemoryCache();
    const load = vi.fn(async () => 42);
    expect(await cached(cache, 'x', 60, load)).toBe(42);
    expect(await cached(cache, 'x', 60, load)).toBe(42);
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('metrics', () => {
  it('renders Prometheus text format', () => {
    const c = new Counter('t_total', 'test');
    c.inc({ route: '/a' });
    c.inc({ route: '/a' });
    expect(c.render()).toContain('t_total{route="/a"} 2');
    const h = new Histogram('lat', 'test', [0.1, 1]);
    h.observe({}, 0.05);
    h.observe({}, 0.5);
    const out = h.render();
    expect(out).toContain('lat_bucket{le="0.1"} 1');
    expect(out).toContain('lat_bucket{le="+Inf"} 2');
    expect(out).toContain('lat_count 2');
  });
});

describe('policies', () => {
  const user = { id: 'u1', role: 'USER' as const };
  const admin = { id: 'a1', role: 'ADMIN' as const };
  it('lets owners and admins modify, nobody vote on their own posts', () => {
    expect(policies.canModify(user, 'u1')).toBe(true);
    expect(policies.canModify(user, 'u2')).toBe(false);
    expect(policies.canModify(admin, 'u2')).toBe(true);
    expect(policies.canVoteOn(user, 'u1')).toBe(false);
    expect(policies.canAcceptAnswer(admin, 'u2')).toBe(false);
  });
});

describe('excerpt', () => {
  it('strips markdown and code blocks', () => {
    expect(excerpt('# Title\n```js\nconst x = 1\n```\nUse **bold** and [links](http://x)')).toBe(
      'Title Use bold and links',
    );
    expect(excerpt('word '.repeat(100), 20).endsWith('…')).toBe(true);
  });
});

describe('EventBus', () => {
  it('isolates failing handlers', async () => {
    const bus = new EventBus(logger);
    const ok = vi.fn();
    bus.on('session.ended', () => {
      throw new Error('boom');
    });
    bus.on('session.ended', ok);
    await bus.emit('session.ended', { sessionId: 's' });
    expect(ok).toHaveBeenCalledOnce();
  });
});

describe('DocManager', () => {
  function store(initial: string): DocStore & { saved: string[] } {
    const saved: string[] = [];
    return {
      saved,
      loadDocument: async () => ({ state: null, code: initial }),
      mergeDocument: async (_id, update) => {
        const d = new Y.Doc();
        Y.applyUpdate(d, update);
        saved.push(d.getText(DOC_TEXT).toString());
        return update;
      },
    };
  }

  it('seeds from the text snapshot, loads once under concurrency, and flushes on release', async () => {
    const s = store('hello');
    const load = vi.spyOn(s, 'loadDocument');
    const docs = new DocManager(s, logger, 10_000);
    const [d1, d2] = await Promise.all([docs.acquire('x'), docs.acquire('x')]);
    expect(d1).toBe(d2);
    expect(load).toHaveBeenCalledOnce();

    const client = new Y.Doc();
    Y.applyUpdate(client, docs.stateOf('x'));
    let update: Uint8Array | null = null;
    client.on('update', (u: Uint8Array) => (update = u));
    client.getText(DOC_TEXT).insert(5, ' world');
    expect(docs.applyUpdate('x', update!)).toBe(true);

    await docs.release('x');
    expect(s.saved).toEqual([]); // still one holder
    await docs.release('x');
    expect(s.saved).toEqual(['hello world']);
    expect(docs.size).toBe(0);
  });

  it('normalises every binary shape a relay can produce', () => {
    const bytes = Uint8Array.from([1, 2, 3]);
    expect(toBytes(Buffer.from(bytes))).toEqual(Buffer.from(bytes));
    expect([...toBytes(bytes.buffer)]).toEqual([1, 2, 3]);
    expect([...toBytes([1, 2, 3])]).toEqual([1, 2, 3]);
    expect([...toBytes({ type: 'Buffer', data: [1, 2, 3] })]).toEqual([1, 2, 3]);
    expect(() => toBytes({ 0: 1 })).toThrow();
  });

  it('never loses edits when two replicas diverge (merging persistence)', async () => {
    // A shared "database" row, merged the same way SessionsService.mergeDocument does.
    const db = new Y.Doc();
    const store: DocStore = {
      loadDocument: async () => ({ state: Y.encodeStateAsUpdate(db), code: '' }),
      mergeDocument: async (_id, update) => {
        Y.applyUpdate(db, update);
        return Y.encodeStateAsUpdate(db);
      },
    };
    const r1 = new DocManager(store, logger, 10_000);
    const r2 = new DocManager(store, logger, 10_000);
    const d1 = await r1.acquire('s');
    const d2 = await r2.acquire('s');
    // Each replica receives only its own client's edit (the cross-replica relay was lost).
    d1.getText(DOC_TEXT).insert(0, 'from-replica-1 ');
    r1.applyUpdate('s', new Uint8Array()); // no-op; keeps the API symmetrical
    const u1 = Y.encodeStateAsUpdate(d1);
    const fresh = new Y.Doc();
    fresh.getText(DOC_TEXT).insert(0, 'from-replica-2');
    expect(r2.applyUpdate('s', Y.encodeStateAsUpdate(fresh))).toBe(true);
    expect(r1.applyUpdate('s', u1)).toBe(true);

    await r1.flush('s');
    await r2.flush('s'); // a plain overwrite here would erase replica 1's edit
    const text = db.getText(DOC_TEXT).toString();
    expect(text).toContain('from-replica-1');
    expect(text).toContain('from-replica-2');
    // ...and replica 2 caught up with replica 1's edit via the merged state.
    expect(d2.getText(DOC_TEXT).toString()).toContain('from-replica-1');
  });

  it('rejects malformed updates', async () => {
    const docs = new DocManager(store(''), logger);
    await docs.acquire('y');
    expect(docs.applyUpdate('y', new Uint8Array([255, 1, 2, 3]))).toBe(false);
  });
});

describe('email templates', () => {
  it('escapes user-controlled values in HTML but keeps them readable in text', async () => {
    const { emails } = await import('../src/jobs/emails.js');
    const m = emails.notification(
      'a@example.com',
      '<img src=x onerror=alert(1)>',
      'answered "<script>alert(1)</script>"',
      'https://devhub.dev/questions/1?a=1&b=2',
    );
    expect(m.html).not.toMatch(/<script|<img/);
    expect(m.html).toContain('&lt;script&gt;');
    expect(m.html).toContain('?a=1&amp;b=2');
    expect(m.text).toContain('<script>'); // plain text is not HTML
  });
});
