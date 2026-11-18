import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import { logger } from './logger.js';

/**
 * Sets an explicit pool size unless the URL already has one. Prisma's default (2 x CPUs + 1)
 * is only 5 connections on a 2-vCPU container, which background jobs plus requests can
 * exhaust (found when CI, on 2 cores, stalled real-time notifications).
 */
export function withPoolSize(url: string, size: number): string {
  if (/[?&]connection_limit=/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}connection_limit=${size}&pool_timeout=20`;
}

/** One client per process; Prisma pools connections internally. */
export function createPrisma(): PrismaClient {
  const prisma = new PrismaClient({
    datasourceUrl: withPoolSize(env.DATABASE_URL, env.DB_POOL_SIZE),
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
