import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import { logger } from './logger.js';

/** One client per process; Prisma pools connections internally. */
export function createPrisma(): PrismaClient {
  const prisma = new PrismaClient({
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
