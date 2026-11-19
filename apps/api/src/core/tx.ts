import { Prisma } from '../generated/prisma/client.js';

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

/**
 * The constraint behind a unique violation, e.g. "users_username_key". With driver adapters
 * (Prisma 7) the details live in meta.driverAdapterError instead of meta.target.
 */
export function uniqueTarget(err: unknown): string {
  if (!isUniqueViolation(err)) return '';
  const meta = (err as Prisma.PrismaClientKnownRequestError).meta as
    | {
        target?: string | string[];
        driverAdapterError?: {
          cause?: { constraint?: { index?: string; fields?: string[] } };
        };
      }
    | undefined;
  const c = meta?.driverAdapterError?.cause?.constraint;
  return String(c?.fields?.join(',') ?? c?.index ?? meta?.target ?? '');
}

export const isNotFound = (err: unknown): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025';
