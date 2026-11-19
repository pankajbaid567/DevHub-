import { createHash, randomBytes } from 'node:crypto';
import type { EmailTokenPurpose } from '../../generated/prisma/client.js';
import type { Tx } from '../../lib/prisma.js';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export const EMAIL_TOKEN_TTL: Record<EmailTokenPurpose, number> = {
  VERIFY_EMAIL: 24 * 3_600_000,
  RESET_PASSWORD: 30 * 60_000,
};

/**
 * Single-use tokens for email links. The raw token only ever exists in the email; the
 * database holds its SHA-256, so a leaked database cannot be used to reset passwords.
 */
export class EmailTokenService {
  /** Creates a token (invalidating older ones of the same purpose) and returns the raw value. */
  async issue(tx: Tx, userId: string, purpose: EmailTokenPurpose): Promise<string> {
    const raw = randomBytes(32).toString('base64url');
    await tx.emailToken.updateMany({
      where: { userId, purpose, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.emailToken.create({
      data: {
        userId,
        purpose,
        tokenHash: sha256(raw),
        expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL[purpose]),
      },
    });
    return raw;
  }

  /**
   * Atomically marks the token used and returns its user, or null if it is unknown, used or
   * expired. The conditional UPDATE makes double-submits safe: only one caller gets the row.
   */
  async consume(tx: Tx, raw: string, purpose: EmailTokenPurpose): Promise<string | null> {
    const rows = await tx.$queryRaw<{ userId: string }[]>`
      UPDATE email_tokens SET "usedAt" = now()
      WHERE "tokenHash" = ${sha256(raw)} AND purpose = ${purpose}::"EmailTokenPurpose"
        AND "usedAt" IS NULL AND "expiresAt" > now()
      RETURNING "userId"`;
    return rows[0]?.userId ?? null;
  }
}
