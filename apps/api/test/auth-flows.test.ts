import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { auth, createTestApp, registerUser, resetDb, settle, tokenFromEmail } from './helpers.js';

const B = '/api/v1/auth';

/** A fake GitHub/Google: records requests and answers token + profile calls. */
function fakeProviders() {
  const calls: { url: string; body?: string }[] = [];
  let githubEmails = [{ email: 'octo@example.com', primary: true, verified: true }];
  const http = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: init?.body ? String(init.body) : undefined });
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    if (url.includes('/access_token') || url.includes('oauth2.googleapis.com/token')) {
      const code = new URLSearchParams(String(init?.body)).get('code');
      return code === 'good-code' ? json({ access_token: 'provider-token' }) : json({}, 400);
    }
    if (url === 'https://api.github.com/user')
      return json({ id: 4242, login: 'Octo-Cat', name: 'Octo Cat', avatar_url: 'https://a/x.png' });
    if (url === 'https://api.github.com/user/emails') return json(githubEmails);
    if (url.includes('openidconnect.googleapis.com'))
      return json({ sub: 'g-1', email: 'grace@example.com', email_verified: true, name: 'Grace' });
    return json({}, 404);
  }) as typeof fetch;
  return {
    http,
    calls,
    setGithubEmails: (e: typeof githubEmails) => {
      githubEmails = e;
    },
  };
}

const providers = fakeProviders();
const { c, app, mailer } = createTestApp({
  oauthFetch: providers.http,
  oauthConfigs: {
    github: { clientId: 'gh-id', clientSecret: 'gh-secret' },
    google: { clientId: 'g-id', clientSecret: 'g-secret' },
  },
});

beforeEach(async () => {
  await resetDb(c);
  mailer.sent.length = 0;
  providers.calls.length = 0;
  providers.setGithubEmails([{ email: 'octo@example.com', primary: true, verified: true }]);
});
afterAll(() => c.db.$disconnect());

describe('email verification', () => {
  it('sends a verification email through the outbox and verifies with the link once', async () => {
    const u = await registerUser(app, 'verifyme');
    let me = await request(app).get(`${B}/me`).set(auth(u)).expect(200);
    expect(me.body.emailVerified).toBe(false);

    // The email row was committed with the user; the relay + worker deliver it.
    await settle(c);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]!.to).toBe('verifyme@example.com');
    const token = tokenFromEmail(mailer, '/verify-email');

    const res = await request(app).post(`${B}/verify-email`).send({ token }).expect(200);
    expect(res.body.emailVerified).toBe(true);
    me = await request(app).get(`${B}/me`).set(auth(u)).expect(200);
    expect(me.body.emailVerified).toBe(true);

    // Single use.
    await request(app).post(`${B}/verify-email`).send({ token }).expect(400);
  });

  it('stores only a hash of the token', async () => {
    await registerUser(app, 'hashcheck');
    await settle(c);
    const token = tokenFromEmail(mailer, '/verify-email');
    const rows = await c.db.emailToken.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).not.toContain(token);
    expect(rows[0]!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('resending invalidates the previous link', async () => {
    const u = await registerUser(app, 'resender');
    await settle(c);
    const first = tokenFromEmail(mailer, '/verify-email');
    await request(app).post(`${B}/resend-verification`).set(auth(u)).expect(202);
    await settle(c);
    const second = tokenFromEmail(mailer, '/verify-email');
    expect(second).not.toBe(first);
    await request(app).post(`${B}/verify-email`).send({ token: first }).expect(400);
    await request(app).post(`${B}/verify-email`).send({ token: second }).expect(200);
    await request(app).post(`${B}/resend-verification`).set(auth(u)).expect(409);
  });

  it('rejects expired links', async () => {
    await registerUser(app, 'expiring');
    await settle(c);
    const token = tokenFromEmail(mailer, '/verify-email');
    await c.db.emailToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await request(app).post(`${B}/verify-email`).send({ token }).expect(400);
  });
});

describe('password reset', () => {
  it('answers the same for unknown and known emails (no account enumeration)', async () => {
    await registerUser(app, 'known');
    await settle(c);
    mailer.sent.length = 0;
    const a = await request(app)
      .post(`${B}/forgot-password`)
      .send({ email: 'nobody@example.com' })
      .expect(202);
    const b = await request(app)
      .post(`${B}/forgot-password`)
      .send({ email: 'known@example.com' })
      .expect(202);
    expect(a.body).toEqual(b.body);
    await settle(c);
    expect(mailer.sent.map((m) => m.to)).toEqual(['known@example.com']);
  });

  it('resets the password once, verifies the email and signs out every device', async () => {
    const u = await registerUser(app, 'forgetful');
    await request(app).post(`${B}/forgot-password`).send({ email: 'forgetful@example.com' });
    await settle(c);
    const token = tokenFromEmail(mailer, '/reset-password');

    await request(app)
      .post(`${B}/reset-password`)
      .send({ token, password: 'brandnew123' })
      .expect(204);
    // Old refresh cookie no longer works.
    await request(app)
      .post(`${B}/refresh`)
      .set('Cookie', u.cookie)
      .set('X-Requested-With', 'devhub')
      .expect(401);
    await request(app)
      .post(`${B}/login`)
      .send({ email: 'forgetful@example.com', password: 'password123' })
      .expect(401);
    const login = await request(app)
      .post(`${B}/login`)
      .send({ email: 'forgetful@example.com', password: 'brandnew123' })
      .expect(200);
    expect(login.body.user.emailVerified).toBe(true);

    await request(app)
      .post(`${B}/reset-password`)
      .send({ token, password: 'another123' })
      .expect(400);
  });

  it('lets only one of two concurrent resets with the same token succeed', async () => {
    await registerUser(app, 'racer');
    await request(app).post(`${B}/forgot-password`).send({ email: 'racer@example.com' });
    await settle(c);
    const token = tokenFromEmail(mailer, '/reset-password');
    const results = await Promise.all(
      ['first1234', 'second1234'].map((password) =>
        request(app).post(`${B}/reset-password`).send({ token, password }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([204, 400]);
  });

  it('changes the password with the current one and rotates tokens', async () => {
    const u = await registerUser(app, 'changer');
    await request(app)
      .post(`${B}/change-password`)
      .set(auth(u))
      .send({ currentPassword: 'wrong', newPassword: 'newpass123' })
      .expect(400);
    const res = await request(app)
      .post(`${B}/change-password`)
      .set(auth(u))
      .send({ currentPassword: 'password123', newPassword: 'newpass123' })
      .expect(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    await request(app)
      .post(`${B}/refresh`)
      .set('Cookie', u.cookie)
      .set('X-Requested-With', 'devhub')
      .expect(401);
  });
});

describe('GitHub / Google sign-in', () => {
  const start = async (provider: string, returnTo = '/questions') => {
    const res = await request(app)
      .get(`${B}/oauth/${provider}/start`)
      .query({ returnTo })
      .expect(302);
    const location = new URL(res.headers.location as string);
    const cookie = (res.headers['set-cookie'] as unknown as string[])
      .find((x) => x.startsWith('dh_oauth='))!
      .split(';')[0]!;
    return { location, cookie, raw: res.headers['set-cookie'] as unknown as string[] };
  };

  it('lists configured providers', async () => {
    const res = await request(app).get(`${B}/providers`).expect(200);
    expect(res.body).toEqual({ github: true, google: true });
  });

  it('redirects with state and a PKCE S256 challenge, in a Lax httpOnly cookie', async () => {
    const { location, raw } = await start('github');
    expect(location.origin + location.pathname).toBe('https://github.com/login/oauth/authorize');
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(location.searchParams.get('state')).toMatch(/^[\w-]{20,}$/);
    expect(location.searchParams.get('redirect_uri')).toBe(
      'http://localhost:5173/api/v1/auth/oauth/github/callback',
    );
    const cookie = raw.find((x) => x.startsWith('dh_oauth='))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('creates a verified account, sets the refresh cookie and returns to the app', async () => {
    const { location, cookie } = await start('github');
    const state = location.searchParams.get('state')!;
    const res = await request(app)
      .get(`${B}/oauth/github/callback`)
      .query({ code: 'good-code', state })
      .set('Cookie', cookie)
      .expect(302);
    expect(res.headers.location).toBe('http://localhost:5173/auth/callback?returnTo=%2Fquestions');
    const rt = (res.headers['set-cookie'] as unknown as string[]).find((x) =>
      x.startsWith('dh_rt='),
    );
    expect(rt).toBeDefined();

    // The token exchange sent the PKCE verifier.
    const tokenCall = providers.calls.find((x) => x.url.includes('access_token'))!;
    expect(new URLSearchParams(tokenCall.body).get('code_verifier')).toMatch(/^[\w-]{40,}$/);

    const refreshed = await request(app)
      .post(`${B}/refresh`)
      .set('Cookie', rt!.split(';')[0]!)
      .set('X-Requested-With', 'devhub')
      .expect(200);
    expect(refreshed.body.user).toMatchObject({
      username: 'octo_cat',
      email: 'octo@example.com',
      emailVerified: true,
      hasPassword: false,
      providers: ['github'],
    });

    // Signing in again finds the same account through the linked identity.
    const again = await start('github');
    await request(app)
      .get(`${B}/oauth/github/callback`)
      .query({ code: 'good-code', state: again.location.searchParams.get('state')! })
      .set('Cookie', again.cookie)
      .expect(302);
    expect(await c.db.user.count()).toBe(1);
  });

  it('links to an existing account with the same verified email', async () => {
    const u = await registerUser(app, 'octo');
    const { location, cookie } = await start('github');
    await request(app)
      .get(`${B}/oauth/github/callback`)
      .query({ code: 'good-code', state: location.searchParams.get('state')! })
      .set('Cookie', cookie)
      .expect(302);
    const accounts = await c.db.oAuthAccount.findMany();
    expect(accounts).toEqual([expect.objectContaining({ userId: u.id, provider: 'github' })]);
  });

  it('refuses identities without a verified email', async () => {
    providers.setGithubEmails([{ email: 'octo@example.com', primary: true, verified: false }]);
    const { location, cookie } = await start('github');
    const res = await request(app)
      .get(`${B}/oauth/github/callback`)
      .query({ code: 'good-code', state: location.searchParams.get('state')! })
      .set('Cookie', cookie)
      .expect(302);
    expect(res.headers.location).toMatch(/\/login\?error=/);
    expect(await c.db.user.count()).toBe(0);
  });

  it('rejects a callback whose state does not match the cookie (login CSRF)', async () => {
    const { cookie } = await start('google');
    const res = await request(app)
      .get(`${B}/oauth/google/callback`)
      .query({ code: 'good-code', state: 'attacker-state' })
      .set('Cookie', cookie)
      .expect(302);
    expect(res.headers.location).toMatch(/\/login\?error=/);
    expect(providers.calls).toHaveLength(0); // never even exchanged the code
  });

  it('never redirects off-site after sign-in (open redirect)', async () => {
    for (const evil of ['//evil.com', 'https://evil.com', '/\\evil.com']) {
      const { location, cookie } = await start('google', evil);
      const res = await request(app)
        .get(`${B}/oauth/google/callback`)
        .query({ code: 'good-code', state: location.searchParams.get('state')! })
        .set('Cookie', cookie)
        .expect(302);
      expect(res.headers.location).toBe('http://localhost:5173/auth/callback?returnTo=%2F');
    }
  });

  it('lets a social-only account set a password without a current one', async () => {
    const { location, cookie } = await start('google');
    const cb = await request(app)
      .get(`${B}/oauth/google/callback`)
      .query({ code: 'good-code', state: location.searchParams.get('state')! })
      .set('Cookie', cookie);
    const rt = (cb.headers['set-cookie'] as unknown as string[])
      .find((x) => x.startsWith('dh_rt='))!
      .split(';')[0]!;
    const r = await request(app)
      .post(`${B}/refresh`)
      .set('Cookie', rt)
      .set('X-Requested-With', 'devhub')
      .expect(200);
    // No password yet: password login fails like any wrong password.
    await request(app)
      .post(`${B}/login`)
      .send({ email: 'grace@example.com', password: 'whatever1' })
      .expect(401);
    await request(app)
      .post(`${B}/change-password`)
      .set({ Authorization: `Bearer ${r.body.accessToken}` })
      .send({ newPassword: 'gracepass1' })
      .expect(200);
    await request(app)
      .post(`${B}/login`)
      .send({ email: 'grace@example.com', password: 'gracepass1' })
      .expect(200);
  });
});
