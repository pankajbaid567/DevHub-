import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import type {
  ChangePasswordInput,
  CurrentUser,
  LoginInput,
  OAuthProvider,
  RegisterInput,
  ResetPasswordInput,
} from '@devhub/shared';
import type { Db, Tx } from '../../lib/prisma.js';
import {
  ConflictError,
  NotFoundError,
  UnauthenticatedError,
  ValidationError,
} from '../../core/errors.js';
import type { Outbox } from '../../jobs/outbox.js';
import { emails } from '../../jobs/emails.js';
import type { IssuedTokens, TokenService } from './token.service.js';
import type { EmailTokenService } from './email-token.service.js';
import type { OAuthProfile } from './oauth.service.js';

const BCRYPT_COST = 12;

/**
 * A real hash of a random password. Comparing against it when the email is unknown makes
 * login take the same time whether or not the account exists (no user enumeration by timing).
 */
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-real-password', BCRYPT_COST);

export const currentUserSelect = {
  id: true,
  username: true,
  email: true,
  displayName: true,
  bio: true,
  avatarUrl: true,
  reputation: true,
  role: true,
  createdAt: true,
  emailVerifiedAt: true,
  emailNotifications: true,
  passwordHash: true,
  oauthAccounts: { select: { provider: true } },
} satisfies Prisma.UserSelect;

type CurrentUserRow = Prisma.UserGetPayload<{ select: typeof currentUserSelect }>;

export const toCurrentUser = (u: CurrentUserRow): CurrentUser => ({
  id: u.id,
  username: u.username,
  email: u.email,
  displayName: u.displayName,
  bio: u.bio,
  avatarUrl: u.avatarUrl,
  reputation: u.reputation,
  role: u.role,
  createdAt: u.createdAt.toISOString(),
  emailVerified: u.emailVerifiedAt !== null,
  hasPassword: u.passwordHash !== null,
  emailNotifications: u.emailNotifications,
  providers: u.oauthAccounts.map((a) => a.provider as OAuthProvider),
});

interface ClientInfo {
  userAgent?: string | undefined;
  ip?: string | undefined;
}

type AuthResult = { user: CurrentUser; tokens: IssuedTokens };

const isUnique = (err: unknown): err is Prisma.PrismaClientKnownRequestError =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

const invalidLink = () =>
  new ValidationError(
    { token: ['Invalid or expired link'] },
    'This link is invalid or has expired',
  );

export class AuthService {
  constructor(
    private readonly db: Db,
    private readonly tokens: TokenService,
    private readonly emailTokens: EmailTokenService,
    private readonly outbox: Outbox,
    private readonly publicUrl: string,
  ) {}

  private async sendVerification(
    tx: Tx,
    user: { id: string; email: string; username: string },
  ): Promise<void> {
    const raw = await this.emailTokens.issue(tx, user.id, 'VERIFY_EMAIL');
    const url = `${this.publicUrl}/verify-email?token=${raw}`;
    await this.outbox.add(tx, 'email.send', emails.verifyEmail(user.email, user.username, url));
  }

  async register(
    input: RegisterInput,
    client: ClientInfo,
    opts: { verified?: boolean } = {},
  ): Promise<AuthResult> {
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
    try {
      // The user row and the verification email commit together (transactional outbox).
      const user = await this.db.$transaction(async (tx) => {
        const u = await tx.user.create({
          data: {
            username: input.username,
            email: input.email,
            passwordHash,
            displayName: input.displayName ?? null,
            emailVerifiedAt: opts.verified ? new Date() : null,
          },
          select: currentUserSelect,
        });
        if (!opts.verified) await this.sendVerification(tx, u);
        return u;
      });
      this.outbox.poke();
      const tokens = await this.tokens.issue(user.id, user.role, client);
      return { user: toCurrentUser(user), tokens };
    } catch (err) {
      // Rely on the unique indexes instead of a racy "check then insert".
      if (isUnique(err)) {
        const field = String((err.meta?.target as string[] | undefined)?.[0] ?? 'account');
        throw new ConflictError(
          field === 'username'
            ? 'That username is taken'
            : 'An account with that email already exists',
          { [field]: [field === 'username' ? 'Already taken' : 'Already registered'] },
        );
      }
      throw err;
    }
  }

  async login(input: LoginInput, client: ClientInfo): Promise<AuthResult> {
    const row = await this.db.user.findUnique({
      where: { email: input.email },
      select: currentUserSelect,
    });
    // OAuth-only accounts have no hash: compare against the dummy so timing is identical.
    const ok = await bcrypt.compare(input.password, row?.passwordHash ?? DUMMY_HASH);
    if (!row?.passwordHash || !ok) throw new UnauthenticatedError('Invalid email or password');

    const tokens = await this.tokens.issue(row.id, row.role, client);
    return { user: toCurrentUser(row), tokens };
  }

  async refresh(refreshToken: string, client: ClientInfo): Promise<AuthResult> {
    const tokens = await this.tokens.rotate(refreshToken, client);
    return { user: await this.me(tokens.userId), tokens };
  }

  async me(userId: string): Promise<CurrentUser> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: currentUserSelect,
    });
    if (!user) throw new NotFoundError('User');
    return toCurrentUser(user);
  }

  // ------------------------------------------------------------------ email verification

  async verifyEmail(token: string): Promise<CurrentUser> {
    const user = await this.db.$transaction(async (tx) => {
      const userId = await this.emailTokens.consume(tx, token, 'VERIFY_EMAIL');
      if (!userId) throw invalidLink();
      return tx.user.update({
        where: { id: userId },
        data: { emailVerifiedAt: new Date() },
        select: currentUserSelect,
      });
    });
    return toCurrentUser(user);
  }

  async resendVerification(userId: string): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const u = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (u.emailVerifiedAt) throw new ConflictError('Your email is already verified');
      await this.sendVerification(tx, u);
    });
    this.outbox.poke();
  }

  // ------------------------------------------------------------------ password reset

  /**
   * Always succeeds from the caller's point of view, so the endpoint cannot be used to find
   * out which emails have accounts.
   */
  async requestPasswordReset(email: string): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const u = await tx.user.findUnique({ where: { email } });
      if (!u) return;
      const raw = await this.emailTokens.issue(tx, u.id, 'RESET_PASSWORD');
      const url = `${this.publicUrl}/reset-password?token=${raw}`;
      await this.outbox.add(tx, 'email.send', emails.resetPassword(u.email, u.username, url));
    });
    this.outbox.poke();
  }

  /** Sets the new password and signs out every device (all refresh tokens revoked). */
  async resetPassword(input: ResetPasswordInput): Promise<void> {
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
    await this.db.$transaction(async (tx) => {
      const userId = await this.emailTokens.consume(tx, input.token, 'RESET_PASSWORD');
      if (!userId) throw invalidLink();
      const u = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      await tx.user.update({
        where: { id: userId },
        // Following the emailed link also proves the address belongs to them.
        data: { passwordHash, emailVerifiedAt: u.emailVerifiedAt ?? new Date() },
      });
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  /** Changes the password, signs out all other devices and returns fresh tokens for this one. */
  async changePassword(
    userId: string,
    input: ChangePasswordInput,
    client: ClientInfo,
  ): Promise<AuthResult> {
    const u = await this.db.user.findUniqueOrThrow({ where: { id: userId } });
    if (u.passwordHash) {
      const ok = await bcrypt.compare(input.currentPassword ?? '', u.passwordHash);
      if (!ok) throw new ValidationError({ currentPassword: ['Incorrect password'] });
    }
    const passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_COST);
    await this.db.$transaction([
      this.db.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.db.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    const tokens = await this.tokens.issue(userId, u.role, client);
    return { user: await this.me(userId), tokens };
  }

  // ------------------------------------------------------------------ GitHub / Google

  /**
   * Resolves an external identity to a user:
   * 1. an account already linked to this provider id signs in;
   * 2. else a user with the same *provider-verified* email gets the identity linked
   *    (safe only because the provider vouches for the address);
   * 3. else a new user is created with a username derived from the profile.
   */
  async oauthLogin(profile: OAuthProfile, client: ClientInfo): Promise<AuthResult> {
    const linked = await this.db.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: { provider: profile.provider, providerAccountId: profile.id },
      },
      select: { userId: true },
    });
    let userId = linked?.userId;

    if (!userId) {
      if (!profile.email || !profile.emailVerified) {
        throw new UnauthenticatedError(
          `Your ${profile.provider} account has no verified email address`,
        );
      }
      const email = profile.email.toLowerCase();
      const existing = await this.db.user.findUnique({ where: { email } });
      if (existing) {
        await this.db.$transaction([
          this.db.oAuthAccount.create({
            data: {
              userId: existing.id,
              provider: profile.provider,
              providerAccountId: profile.id,
            },
          }),
          this.db.user.update({
            where: { id: existing.id },
            data: {
              emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
              avatarUrl: existing.avatarUrl ?? profile.avatarUrl,
            },
          }),
        ]);
        userId = existing.id;
      } else {
        userId = await this.createOAuthUser(profile, email);
      }
    }

    const user = await this.me(userId);
    const tokens = await this.tokens.issue(user.id, user.role, client);
    return { user, tokens };
  }

  private async createOAuthUser(profile: OAuthProfile, email: string): Promise<string> {
    const base = (profile.username ?? email.split('@')[0] ?? 'dev')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 18)
      .padEnd(3, '_');
    for (let attempt = 0; attempt < 5; attempt++) {
      const username = attempt === 0 ? base : `${base}_${Math.floor(Math.random() * 10_000)}`;
      try {
        const u = await this.db.user.create({
          data: {
            username,
            email,
            passwordHash: null,
            displayName: profile.name?.slice(0, 50) ?? null,
            avatarUrl: profile.avatarUrl,
            emailVerifiedAt: new Date(),
            oauthAccounts: {
              create: { provider: profile.provider, providerAccountId: profile.id },
            },
          },
        });
        return u.id;
      } catch (err) {
        const target = isUnique(err) ? String(err.meta?.target ?? '') : '';
        if (!target.includes('username')) throw err;
      }
    }
    throw new ConflictError('Could not pick a free username, please register with email');
  }
}
