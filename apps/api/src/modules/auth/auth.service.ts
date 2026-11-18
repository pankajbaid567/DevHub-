import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import type { CurrentUser, LoginInput, RegisterInput } from '@devhub/shared';
import type { Db } from '../../lib/prisma.js';
import { ConflictError, NotFoundError, UnauthenticatedError } from '../../core/errors.js';
import type { IssuedTokens, TokenService } from './token.service.js';

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
} satisfies Prisma.UserSelect;

type CurrentUserRow = Prisma.UserGetPayload<{ select: typeof currentUserSelect }>;

export const toCurrentUser = (u: CurrentUserRow): CurrentUser => ({
  ...u,
  createdAt: u.createdAt.toISOString(),
});

interface ClientInfo {
  userAgent?: string | undefined;
  ip?: string | undefined;
}

export class AuthService {
  constructor(
    private readonly db: Db,
    private readonly tokens: TokenService,
  ) {}

  async register(
    input: RegisterInput,
    client: ClientInfo,
  ): Promise<{ user: CurrentUser; tokens: IssuedTokens }> {
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
    try {
      const user = await this.db.user.create({
        data: {
          username: input.username,
          email: input.email,
          passwordHash,
          displayName: input.displayName ?? null,
        },
        select: currentUserSelect,
      });
      const tokens = await this.tokens.issue(user.id, user.role, client);
      return { user: toCurrentUser(user), tokens };
    } catch (err) {
      // Rely on the unique indexes instead of a racy "check then insert".
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
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

  async login(
    input: LoginInput,
    client: ClientInfo,
  ): Promise<{ user: CurrentUser; tokens: IssuedTokens }> {
    const row = await this.db.user.findUnique({
      where: { email: input.email },
      select: { ...currentUserSelect, passwordHash: true },
    });
    const ok = await bcrypt.compare(input.password, row?.passwordHash ?? DUMMY_HASH);
    if (!row || !ok) throw new UnauthenticatedError('Invalid email or password');

    const { passwordHash: _omit, ...user } = row;
    const tokens = await this.tokens.issue(user.id, user.role, client);
    return { user: toCurrentUser(user), tokens };
  }

  async refresh(
    refreshToken: string,
    client: ClientInfo,
  ): Promise<{ user: CurrentUser; tokens: IssuedTokens }> {
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
}
