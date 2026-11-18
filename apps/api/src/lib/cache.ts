import type { Redis } from 'ioredis';

/**
 * Cache abstraction (Strategy pattern). Production uses Redis so every instance shares one
 * cache; tests and single-instance development use the in-memory implementation.
 */
export interface Cache {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  del(...keys: string[]): Promise<void>;
  /** Sets the key only if absent. Returns true if this call created it (for de-duplication). */
  setIfAbsent(key: string, ttlSeconds: number): Promise<boolean>;
}

export class RedisCache implements Cache {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = 'devhub:',
  ) {}

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(this.prefix + key);
    return raw === null ? null : (JSON.parse(raw) as T);
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.redis.set(this.prefix + key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length) await this.redis.del(...keys.map((k) => this.prefix + k));
  }

  async setIfAbsent(key: string, ttlSeconds: number): Promise<boolean> {
    return (await this.redis.set(this.prefix + key, '1', 'EX', ttlSeconds, 'NX')) === 'OK';
  }
}

export class MemoryCache implements Cache {
  private readonly store = new Map<string, { value: string; expiresAt: number }>();

  constructor(private readonly maxEntries = 10_000) {}

  private live(key: string) {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit;
  }

  async get<T>(key: string): Promise<T | null> {
    const hit = this.live(key);
    return hit ? (JSON.parse(hit.value) as T) : null;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    if (this.store.size >= this.maxEntries) {
      // Evict the oldest insertion (Map preserves insertion order): a simple bounded FIFO.
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, {
      value: JSON.stringify(value),
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async del(...keys: string[]): Promise<void> {
    for (const k of keys) this.store.delete(k);
  }

  async setIfAbsent(key: string, ttlSeconds: number): Promise<boolean> {
    if (this.live(key)) return false;
    await this.set(key, 1, ttlSeconds);
    return true;
  }
}

/** Read-through helper: return the cached value or compute, store and return it. */
export async function cached<T>(
  cache: Cache,
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>,
): Promise<T> {
  const hit = await cache.get<T>(key);
  if (hit !== null) return hit;
  const value = await load();
  await cache.set(key, value, ttlSeconds);
  return value;
}
