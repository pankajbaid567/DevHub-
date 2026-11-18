import { Prisma } from '@prisma/client';

/**
 * Retries a transaction on serialization failures (P2034) and unique-constraint races
 * (P2002), e.g. two concurrent first votes by the same user. Bounded, with jitter.
 */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const retryable =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        (err.code === 'P2034' || err.code === 'P2002');
      if (!retryable || i >= attempts) throw err;
      await new Promise((r) => setTimeout(r, 10 * i + Math.random() * 20));
    }
  }
}

export const isUniqueViolation = (err: unknown): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

export const isNotFound = (err: unknown): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025';
