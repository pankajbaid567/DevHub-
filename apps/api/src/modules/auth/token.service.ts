import { createHash, randomBytes, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Role } from '@devhub/shared';
import { ErrorCode } from '@devhub/shared';
import type { Db } from '../../lib/prisma.js';
import type { Env } from '../../config/env.js';
import { UnauthenticatedError } from '../../core/errors.js';
import type { Logger } from '../../lib/logger.js';

export interface AccessClaims {
  sub: string;
  role: Role;
  /** Expiry, seconds since the epoch. */
  exp: number;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresAt: Date;
}

interface ClientInfo {
  userAgent?: string | undefined;
  ip?: string | undefined;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * Short-lived JWT access tokens + opaque rotating refresh tokens.
 *
 * - Access tokens (15 min) are stateless and verified without a DB hit.
 * - Refresh tokens are 256-bit random strings; only their SHA-256 is stored.
 * - Every refresh rotates: the old token is revoked and linked to its replacement.
 * - Reuse detection: presenting an already-revoked token means it was stolen (or replayed),
 *   so the entire token family is revoked and the user must sign in again (OAuth 2.0 BCP).
 */
export class TokenService {
  constructor(
    private readonly db: Db,
    private readonly env: Env,
    private readonly logger: Logger,
  ) {}

  signAccess(userId: string, role: Role): string {
    return jwt.sign({ role } satisfies Pick<AccessClaims, 'role'>, this.env.JWT_ACCESS_SECRET, {
      subject: userId,
      expiresIn: this.env.JWT_ACCESS_TTL_SECONDS,
      algorithm: 'HS256',
      issuer: 'devhub-api',
      audience: 'devhub-web',
    });
  }

  verifyAccess(token: string): AccessClaims {
    try {
      const p = jwt.verify(token, this.env.JWT_ACCESS_SECRET, {
        algorithms: ['HS256'],
        issuer: 'devhub-api',
        audience: 'devhub-web',
      }) as jwt.JwtPayload;
      if (typeof p.sub !== 'string') throw new Error('missing sub');
      return { sub: p.sub, role: (p.role as Role) ?? 'USER', exp: p.exp ?? 0 };
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        throw new UnauthenticatedError('Access token expired', ErrorCode.TOKEN_EXPIRED);
      }
      throw new UnauthenticatedError('Invalid access token');
    }
  }

  async issue(
    userId: string,
    role: Role,
    client: ClientInfo,
    familyId: string = randomUUID(),
  ): Promise<IssuedTokens> {
    const refreshToken = randomBytes(32).toString('base64url');
    const refreshExpiresAt = new Date(Date.now() + this.env.REFRESH_TTL_DAYS * 86_400_000);
    await this.db.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: sha256(refreshToken),
        expiresAt: refreshExpiresAt,
        userAgent: client.userAgent?.slice(0, 255) ?? null,
        ip: client.ip ?? null,
      },
    });
    return {
      accessToken: this.signAccess(userId, role),
      refreshToken,
      expiresIn: this.env.JWT_ACCESS_TTL_SECONDS,
      refreshExpiresAt,
    };
  }

  /** Exchanges a refresh token for a new pair. Throws on unknown, expired or reused tokens. */
  async rotate(presented: string, client: ClientInfo): Promise<IssuedTokens & { userId: string }> {
    const record = await this.db.refreshToken.findUnique({
      where: { tokenHash: sha256(presented) },
      include: { user: { select: { id: true, role: true } } },
    });
    if (!record) throw new UnauthenticatedError('Invalid refresh token');

    if (record.revokedAt) {
      await this.revokeFamily(record.familyId);
      this.logger.warn(
        { userId: record.userId, familyId: record.familyId },
        'refresh token reuse detected; family revoked',
      );
      throw new UnauthenticatedError('Refresh token was already used; please sign in again');
    }
    if (record.expiresAt <= new Date()) throw new UnauthenticatedError('Refresh token expired');

    // Conditional update makes rotation atomic: of two concurrent refreshes with the same
    // token, exactly one wins; the loser is treated as reuse on its next attempt.
    const claimed = await this.db.refreshToken.updateMany({
      where: { id: record.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count === 0)
      throw new UnauthenticatedError('Refresh token was already used; please sign in again');

    const next = await this.issue(record.user.id, record.user.role, client, record.familyId);
    await this.db.refreshToken.update({
      where: { id: record.id },
      data: { replacedBy: sha256(next.refreshToken) },
    });
    return { ...next, userId: record.user.id };
  }

  async revoke(presented: string): Promise<void> {
    const record = await this.db.refreshToken.findUnique({
      where: { tokenHash: sha256(presented) },
    });
    if (record) await this.revokeFamily(record.familyId);
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.db.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Housekeeping: drop tokens that expired more than a day ago. */
  async purgeExpired(): Promise<number> {
    const { count } = await this.db.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date(Date.now() - 86_400_000) } },
    });
    return count;
  }
}
