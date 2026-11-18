import { createHash, randomBytes } from 'node:crypto';
import type { OAuthProvider } from '@devhub/shared';
import { UnauthenticatedError } from '../../core/errors.js';

export interface OAuthProfile {
  provider: OAuthProvider;
  /** Stable provider user id (never the email, which can change). */
  id: string;
  email: string | null;
  emailVerified: boolean;
  username: string | null;
  name: string | null;
  avatarUrl: string | null;
}

interface ProviderConfig {
  clientId: string;
  clientSecret: string;
}

interface ProviderSpec {
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  profile(token: string, http: typeof fetch): Promise<OAuthProfile>;
}

async function getJson<T>(http: typeof fetch, url: string, token: string): Promise<T> {
  const res = await http(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'User-Agent': 'DevHub+',
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new UnauthenticatedError(`Provider profile request failed (${res.status})`);
  return (await res.json()) as T;
}

const SPECS: Record<OAuthProvider, ProviderSpec> = {
  github: {
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scope: 'read:user user:email',
    async profile(token, http) {
      const u = await getJson<{
        id: number;
        login: string;
        name: string | null;
        avatar_url: string | null;
      }>(http, 'https://api.github.com/user', token);
      // /user only shows the public email; /user/emails says which one is primary and verified.
      const list = await getJson<{ email: string; primary: boolean; verified: boolean }[]>(
        http,
        'https://api.github.com/user/emails',
        token,
      );
      const primary = list.find((e) => e.primary && e.verified) ?? list.find((e) => e.verified);
      return {
        provider: 'github',
        id: String(u.id),
        email: primary?.email ?? null,
        emailVerified: Boolean(primary),
        username: u.login,
        name: u.name,
        avatarUrl: u.avatar_url,
      };
    },
  },
  google: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
    async profile(token, http) {
      const u = await getJson<{
        sub: string;
        email?: string;
        email_verified?: boolean;
        name?: string;
        picture?: string;
      }>(http, 'https://openidconnect.googleapis.com/v1/userinfo', token);
      return {
        provider: 'google',
        id: u.sub,
        email: u.email ?? null,
        emailVerified: u.email_verified === true,
        username: null,
        name: u.name ?? null,
        avatarUrl: u.picture ?? null,
      };
    },
  },
};

/** What the start step stores (in a short-lived httpOnly cookie) for the callback to check. */
export interface OAuthState {
  state: string;
  verifier: string;
  returnTo: string;
}

const b64url = (buf: Buffer) => buf.toString('base64url');

/** Only same-site relative paths: never "//evil.com" or "https://…" (open redirect). */
export function safeReturnTo(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : '/';
  return /^\/(?![/\\])[\w\-./?=&#%]*$/.test(s) ? s : '/';
}

/**
 * OAuth 2.0 authorization-code flow with PKCE (RFC 7636) and a `state` value, implemented
 * directly against the providers: two redirects and two HTTP calls do not need a framework.
 * `state` stops login CSRF (an attacker cannot complete *their* login in your browser);
 * PKCE means a stolen authorization code is useless without the verifier.
 */
export class OAuthService {
  constructor(
    private readonly configs: Record<OAuthProvider, ProviderConfig | null>,
    private readonly callbackBase: string,
    private readonly http: typeof fetch = fetch,
  ) {}

  enabled(): Record<OAuthProvider, boolean> {
    return { github: Boolean(this.configs.github), google: Boolean(this.configs.google) };
  }

  private config(provider: OAuthProvider): ProviderConfig {
    const c = this.configs[provider];
    if (!c) throw new UnauthenticatedError(`${provider} sign-in is not configured`);
    return c;
  }

  private redirectUri(provider: OAuthProvider) {
    return `${this.callbackBase}/api/v1/auth/oauth/${provider}/callback`;
  }

  start(provider: OAuthProvider, returnTo: unknown): { url: string; state: OAuthState } {
    const c = this.config(provider);
    const spec = SPECS[provider];
    const state: OAuthState = {
      state: b64url(randomBytes(24)),
      verifier: b64url(randomBytes(48)),
      returnTo: safeReturnTo(returnTo),
    };
    const challenge = b64url(createHash('sha256').update(state.verifier).digest());
    const params = new URLSearchParams({
      client_id: c.clientId,
      redirect_uri: this.redirectUri(provider),
      response_type: 'code',
      scope: spec.scope,
      state: state.state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      ...(provider === 'google' && { prompt: 'select_account' }),
    });
    return { url: `${spec.authorizeUrl}?${params}`, state };
  }

  async complete(
    provider: OAuthProvider,
    query: { code?: unknown; state?: unknown; error?: unknown },
    stored: OAuthState | null,
  ): Promise<OAuthProfile> {
    if (query.error) throw new UnauthenticatedError('Sign-in was cancelled');
    if (!stored || typeof query.state !== 'string' || query.state !== stored.state)
      throw new UnauthenticatedError('Sign-in session expired, please try again');
    if (typeof query.code !== 'string' || !query.code)
      throw new UnauthenticatedError('Missing authorization code');

    const c = this.config(provider);
    const res = await this.http(SPECS[provider].tokenUrl, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: c.clientId,
        client_secret: c.clientSecret,
        code: query.code,
        redirect_uri: this.redirectUri(provider),
        grant_type: 'authorization_code',
        code_verifier: stored.verifier,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => ({}))) as { access_token?: string };
    if (!res.ok || !body.access_token)
      throw new UnauthenticatedError('Could not complete sign-in with the provider');
    return SPECS[provider].profile(body.access_token, this.http);
  }
}
