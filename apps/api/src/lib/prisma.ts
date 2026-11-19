import { PrismaPg } from '@prisma/adapter-pg';
import type { PoolConfig } from 'pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { env } from '../config/env.js';
import { logger } from './logger.js';

/**
 * Pool settings for the pg driver adapter (Prisma 7 talks to Postgres through node-postgres).
 * The size is explicit: a small default is easy to exhaust with background jobs plus requests
 * (found when CI, on 2 cores, stalled real-time notifications). `connection_limit` in the URL
 * still wins, so existing deployment URLs keep working.
 */
export function poolConfig(url: string, size: number): PoolConfig {
  const parsed = new URL(url);
  const limit = Number(parsed.searchParams.get('connection_limit')) || size;
  for (const p of ['connection_limit', 'pool_timeout', 'schema']) parsed.searchParams.delete(p);
  return {
    connectionString: parsed.toString(),
    max: limit,
    connectionTimeoutMillis: 20_000,
    idleTimeoutMillis: 30_000,
  };
}

/** One client per process; the adapter's pg.Pool holds the connections. */
export function createPrisma(): PrismaClient {
  const prisma = new PrismaClient({
    adapter: new PrismaPg(poolConfig(env.DATABASE_URL, env.DB_POOL_SIZE), {
      schema: new URL(env.DATABASE_URL).searchParams.get('schema') ?? undefined,
    }),
    transactionOptions: { maxWait: 5_000, timeout: 10_000 },
    log: env.isProd
      ? [{ emit: 'event', level: 'warn' }]
      : [
          { emit: 'event', level: 'warn' },
          { emit: 'event', level: 'error' },
        ],
  });
  prisma.$on('warn', (e) => logger.warn({ prisma: e.message }, 'prisma warning'));
  return prisma;
}

export type Db = PrismaClient;

/** Transaction client type, so services can run inside or outside a transaction. */
export type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;
