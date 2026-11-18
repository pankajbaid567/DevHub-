import jwt from 'jsonwebtoken';
import { ErrorCode } from '@devhub/shared';
import type { Db } from '../../lib/prisma.js';
import type { Cache } from '../../lib/cache.js';
import {
  AppError,
  ConflictError,
  UnauthenticatedError,
  ValidationError,
} from '../../core/errors.js';
import {
  SecretBox,
  hashRecoveryCode,
  newRecoveryCodes,
  newTotpSecret,
  otpauthUri,
  verifyTotp,
} from './totp.js';

const MFA_TTL_S = 300;
const MAX_FAILURES = 5;
const LOCK_WINDOW_S = 15 * 60;

/**
 * Two-factor authentication (TOTP + recovery codes).
 *
 * Login with 2FA is two steps: the password step returns a 5-minute, single-purpose
 * "MFA challenge" JWT (a different audience, so it can never act as an access token), and
 * the code step exchanges it plus a valid code for the normal session. Five wrong codes lock
 * the account's second step for 15 minutes (counter in Redis, so it holds across replicas).
 */
export class TwoFactorService {
  private readonly box: SecretBox;

  constructor(
    private readonly db: Db,
    private readonly cache: Cache,
    private readonly secret: string,
  ) {
    this.box = new SecretBox(secret);
  }

  // ------------------------------------------------------------------ enrolment

  async setup(userId: string): Promise<{ secret: string; otpauthUri: string }> {
    const u = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    if (u.totpEnabledAt) throw new ConflictError('Two-factor authentication is already on');
    const secret = newTotpSecret();
    await this.db.user.update({
      where: { id: userId },
      data: { totpPendingSecret: this.box.seal(secret) },
    });
    return { secret, otpauthUri: otpauthUri(secret, u.email) };
  }

  /** Confirms enrolment with a first valid code; returns recovery codes (shown once). */
  async enable(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
    const u = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    if (u.totpEnabledAt) throw new ConflictError('Two-factor authentication is already on');
    if (!u.totpPendingSecret) throw new ValidationError({ code: ['Start setup first'] });
    const step = verifyTotp(this.box.open(u.totpPendingSecret), code, null);
    if (step === null) throw new ValidationError({ code: ['That code is not valid'] });
    const codes = newRecoveryCodes();
    await this.db.$transaction([
      this.db.user.update({
        where: { id: userId },
        data: {
          totpSecret: u.totpPendingSecret,
          totpPendingSecret: null,
          totpEnabledAt: new Date(),
          totpLastStep: step,
        },
      }),
      this.db.recoveryCode.deleteMany({ where: { userId } }),
      this.db.recoveryCode.createMany({
        data: codes.map((c) => ({ userId, codeHash: hashRecoveryCode(c) })),
      }),
    ]);
    return { recoveryCodes: codes };
  }

  async disable(userId: string, code: string): Promise<void> {
    if (!(await this.check(userId, code)))
      throw new ValidationError({ code: ['That code is not valid'] });
    await this.db.$transaction([
      this.db.user.update({
        where: { id: userId },
        data: {
          totpSecret: null,
          totpPendingSecret: null,
          totpEnabledAt: null,
          totpLastStep: null,
        },
      }),
      this.db.recoveryCode.deleteMany({ where: { userId } }),
    ]);
  }

  // ------------------------------------------------------------------ login challenge

  issueChallenge(userId: string): { mfaToken: string; expiresIn: number } {
    const mfaToken = jwt.sign({ purpose: 'mfa' }, this.secret, {
      subject: userId,
      expiresIn: MFA_TTL_S,
      issuer: 'devhub-api',
      audience: 'devhub-mfa',
      algorithm: 'HS256',
    });
    return { mfaToken, expiresIn: MFA_TTL_S };
  }

  /** Validates the challenge and the code; returns the user id to sign in. */
  async completeChallenge(mfaToken: string, code: string): Promise<string> {
    let userId: string;
    try {
      const p = jwt.verify(mfaToken, this.secret, {
        algorithms: ['HS256'],
        issuer: 'devhub-api',
        audience: 'devhub-mfa',
      }) as jwt.JwtPayload;
      if (p.purpose !== 'mfa' || !p.sub) throw new Error('bad purpose');
      userId = p.sub;
    } catch {
      throw new UnauthenticatedError('Sign-in step expired, please sign in again');
    }
    const key = `mfa:fail:${userId}`;
    const failures = (await this.cache.get<number>(key)) ?? 0;
    if (failures >= MAX_FAILURES)
      throw new AppError(
        429,
        ErrorCode.RATE_LIMITED,
        'Too many wrong codes. Try again in 15 minutes.',
      );
    if (!(await this.check(userId, code))) {
      await this.cache.set(key, failures + 1, LOCK_WINDOW_S);
      throw new ValidationError({ code: ['That code is not valid'] }, 'That code is not valid');
    }
    await this.cache.del(key);
    return userId;
  }

  /**
   * Accepts a current TOTP code (each time step at most once) or an unused recovery code.
   * Both "use" operations are conditional UPDATEs, so concurrent submissions of the same code
   * cannot both succeed.
   */
  private async check(userId: string, code: string): Promise<boolean> {
    const u = await this.db.user.findUnique({
      where: { id: userId },
      select: { totpSecret: true, totpEnabledAt: true, totpLastStep: true },
    });
    if (!u?.totpEnabledAt || !u.totpSecret) return false;
    const trimmed = code.trim();
    if (/^\d{6}$/.test(trimmed)) {
      const step = verifyTotp(this.box.open(u.totpSecret), trimmed, u.totpLastStep);
      if (step === null) return false;
      const { count } = await this.db.user.updateMany({
        where: { id: userId, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
        data: { totpLastStep: step },
      });
      return count === 1;
    }
    const { count } = await this.db.recoveryCode.updateMany({
      where: { userId, codeHash: hashRecoveryCode(trimmed), usedAt: null },
      data: { usedAt: new Date() },
    });
    return count === 1;
  }

  async remainingRecoveryCodes(userId: string): Promise<number> {
    return this.db.recoveryCode.count({ where: { userId, usedAt: null } });
  }
}
