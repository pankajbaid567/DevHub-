import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { auth, createTestApp, registerUser, resetDb } from './helpers.js';

const { c, app } = createTestApp();
const B = '/api/v1/auth';

beforeEach(() => resetDb(c));
afterAll(() => c.db.$disconnect());

describe('registration', () => {
  it('creates an account, normalises identifiers and sets an httpOnly strict refresh cookie', async () => {
    const res = await request(app)
      .post(`${B}/register`)
      .send({ username: 'Ada_L', email: 'ADA@Example.com', password: 'lovelace12' })
      .expect(201);
    expect(res.body.user).toMatchObject({
      username: 'ada_l',
      email: 'ada@example.com',
      reputation: 0,
      role: 'USER',
    });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.body.accessToken).toEqual(expect.any(String));
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!;
    expect(cookie).toMatch(/^dh_rt=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
  });

  it('returns field errors for invalid input', async () => {
    const res = await request(app)
      .post(`${B}/register`)
      .send({ username: 'a', email: 'nope', password: 'short' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(Object.keys(res.body.error.details)).toEqual(
      expect.arrayContaining(['username', 'email', 'password']),
    );
  });

  it('rejects a duplicate username or email with 409', async () => {
    await registerUser(app, 'grace');
    const res = await request(app)
      .post(`${B}/register`)
      .send({ username: 'GRACE', email: 'other@example.com', password: 'password123' })
      .expect(409);
    expect(res.body.error.details.username).toBeDefined();
  });

  it('never stores the plain password', async () => {
    await registerUser(app, 'hashme');
    const row = await c.db.user.findUniqueOrThrow({ where: { username: 'hashme' } });
    expect(row.passwordHash).toMatch(/^\$2[aby]\$12\$/);
  });
});

describe('login', () => {
  it('signs in with the right password', async () => {
    await registerUser(app, 'linus');
    const res = await request(app)
      .post(`${B}/login`)
      .send({ email: 'linus@example.com', password: 'password123' })
      .expect(200);
    expect(res.body.user.username).toBe('linus');
  });

  it('gives the same error for a wrong password and an unknown email (no enumeration)', async () => {
    await registerUser(app, 'linus');
    const wrong = await request(app)
      .post(`${B}/login`)
      .send({ email: 'linus@example.com', password: 'nope12345' })
      .expect(401);
    const unknown = await request(app)
      .post(`${B}/login`)
      .send({ email: 'ghost@example.com', password: 'nope12345' })
      .expect(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });
});

describe('tokens', () => {
  it('protects /me and accepts a valid bearer token', async () => {
    await request(app).get(`${B}/me`).expect(401);
    await request(app).get(`${B}/me`).set('Authorization', 'Bearer not-a-jwt').expect(401);
    const u = await registerUser(app);
    const me = await request(app).get(`${B}/me`).set(auth(u)).expect(200);
    expect(me.body.id).toBe(u.id);
  });

  it('rejects a token signed with another secret', async () => {
    const jwt = await import('jsonwebtoken');
    const forged = jwt.default.sign({ role: 'ADMIN' }, 'some-other-secret-that-is-long-enough!!', {
      subject: 'x',
      audience: 'devhub-web',
      issuer: 'devhub-api',
    });
    await request(app).get(`${B}/me`).set('Authorization', `Bearer ${forged}`).expect(401);
  });

  it('requires the CSRF header on refresh', async () => {
    const u = await registerUser(app);
    await request(app).post(`${B}/refresh`).set('Cookie', u.cookie).expect(401);
  });

  it('rotates the refresh token and detects reuse by revoking the whole family', async () => {
    const u = await registerUser(app);
    const first = await request(app)
      .post(`${B}/refresh`)
      .set('Cookie', u.cookie)
      .set('X-Requested-With', 'devhub')
      .expect(200);
    const rotated = (first.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    expect(rotated).not.toBe(u.cookie);

    // Replaying the old token is treated as theft...
    await request(app)
      .post(`${B}/refresh`)
      .set('Cookie', u.cookie)
      .set('X-Requested-With', 'devhub')
      .expect(401);
    // ...so even the legitimately rotated token no longer works.
    await request(app)
      .post(`${B}/refresh`)
      .set('Cookie', rotated)
      .set('X-Requested-With', 'devhub')
      .expect(401);
  });

  it('allows only one of two concurrent refreshes with the same token', async () => {
    const u = await registerUser(app);
    const send = () =>
      request(app).post(`${B}/refresh`).set('Cookie', u.cookie).set('X-Requested-With', 'devhub');
    const results = await Promise.all([send(), send()]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
  });

  it('logout revokes the refresh token', async () => {
    const u = await registerUser(app);
    await request(app)
      .post(`${B}/logout`)
      .set('Cookie', u.cookie)
      .set('X-Requested-With', 'devhub')
      .expect(204);
    await request(app)
      .post(`${B}/refresh`)
      .set('Cookie', u.cookie)
      .set('X-Requested-With', 'devhub')
      .expect(401);
  });
});

describe('privacy', () => {
  it('never exposes emails in public profiles', async () => {
    await registerUser(app, 'private_person');
    const res = await request(app).get('/api/v1/users/private_person').expect(200);
    expect(JSON.stringify(res.body)).not.toContain('@example.com');
  });
});
