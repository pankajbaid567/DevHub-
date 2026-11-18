import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  base32Encode,
  currentStep,
  hotp,
  SecretBox,
  verifyTotp,
} from '../src/modules/auth/totp.js';
import { auth, createTestApp, registerUser, resetDb, type TestUser } from './helpers.js';

const { c, app } = createTestApp();
const A = '/api/v1/auth';

beforeEach(async () => {
  await resetDb(c);
  await c.cache.del();
});
afterAll(() => c.db.$disconnect());

describe('TOTP primitives', () => {
  it('matches the RFC 6238 SHA-1 test vector', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    // T = 59 s -> counter 1 -> 94287082 (8 digits) -> 287082 with 6 digits.
    expect(hotp(secret, 1)).toBe('287082');
    expect(verifyTotp(secret, '287082', null, 59_000)).toBe(1);
  });

  it('accepts one step of drift and never the same step twice', () => {
    const secret = base32Encode(Buffer.from('another-secret-12345'));
    const now = 1_800_000_000_000;
    const step = currentStep(now);
    expect(verifyTotp(secret, hotp(secret, step - 1), null, now)).toBe(step - 1);
    expect(verifyTotp(secret, hotp(secret, step - 2), null, now)).toBeNull();
    expect(verifyTotp(secret, hotp(secret, step), step, now)).toBeNull(); // replay
  });

  it('seals secrets with authenticated encryption', () => {
    const box = new SecretBox('server-secret-0123456789abcdefghijklmnop');
    const sealed = box.seal('JBSWY3DPEHPK3PXP');
    expect(sealed).not.toContain('JBSWY3DPEHPK3PXP');
    expect(box.open(sealed)).toBe('JBSWY3DPEHPK3PXP');
    const tampered = sealed.slice(0, -2) + (sealed.endsWith('A') ? 'BB' : 'AA');
    expect(() => box.open(tampered)).toThrow();
  });
});

async function enroll(u: TestUser) {
  const setup = await request(app).post(`${A}/2fa/setup`).set(auth(u)).expect(200);
  expect(setup.body.otpauthUri).toMatch(/^otpauth:\/\/totp\/DevHub%2B%3A/);
  const secret = setup.body.secret as string;
  const enabled = await request(app)
    .post(`${A}/2fa/enable`)
    .set(auth(u))
    .send({ code: hotp(secret, currentStep()) })
    .expect(200);
  return { secret, recovery: enabled.body.recoveryCodes as string[] };
}

const login = (username: string) =>
  request(app)
    .post(`${A}/login`)
    .send({ email: `${username}@example.com`, password: 'password123' });

describe('two-factor login', () => {
  it('enrols, stores the secret encrypted, and requires a code at login', async () => {
    const u = await registerUser(app, 'mfauser');
    const { secret, recovery } = await enroll(u);
    expect(recovery).toHaveLength(10);
    const row = await c.db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(row.totpSecret).not.toContain(secret);
    expect((await request(app).get(`${A}/me`).set(auth(u))).body.twoFactorEnabled).toBe(true);

    const first = await login('mfauser').expect(200);
    expect(first.body).toMatchObject({ mfaRequired: true, expiresIn: 300 });
    expect(first.body.accessToken).toBeUndefined();
    expect(first.headers['set-cookie']).toBeUndefined(); // no session yet

    // The challenge is not an access token.
    await request(app)
      .get(`${A}/me`)
      .set({ Authorization: `Bearer ${first.body.mfaToken}` })
      .expect(401);

    const code = hotp(secret, currentStep() + 1); // the enrolment used the current step
    const done = await request(app)
      .post(`${A}/2fa/verify`)
      .send({ mfaToken: first.body.mfaToken, code })
      .expect(200);
    expect(done.body.accessToken).toEqual(expect.any(String));
    expect(String(done.headers['set-cookie'])).toMatch(/dh_rt=/);

    // The same code cannot be used again (replay).
    const again = await login('mfauser');
    await request(app)
      .post(`${A}/2fa/verify`)
      .send({ mfaToken: again.body.mfaToken, code })
      .expect(400);
  });

  it('accepts each recovery code once', async () => {
    const u = await registerUser(app, 'recover');
    const { recovery } = await enroll(u);
    const ch = await login('recover');
    await request(app)
      .post(`${A}/2fa/verify`)
      .send({ mfaToken: ch.body.mfaToken, code: recovery[0] })
      .expect(200);
    const ch2 = await login('recover');
    await request(app)
      .post(`${A}/2fa/verify`)
      .send({ mfaToken: ch2.body.mfaToken, code: recovery[0] })
      .expect(400);
    expect((await request(app).get(`${A}/2fa`).set(auth(u))).body).toEqual({
      enabled: true,
      recoveryCodesLeft: 9,
    });
  });

  it('locks the second step after five wrong codes', async () => {
    const u = await registerUser(app, 'bruteforce');
    const { secret } = await enroll(u);
    const ch = await login('bruteforce');
    for (let i = 0; i < 5; i++)
      await request(app)
        .post(`${A}/2fa/verify`)
        .send({ mfaToken: ch.body.mfaToken, code: '000000' })
        .expect(400);
    await request(app)
      .post(`${A}/2fa/verify`)
      .send({ mfaToken: ch.body.mfaToken, code: hotp(secret, currentStep() + 1) })
      .expect(429);
  });

  it('rejects forged or expired challenges', async () => {
    await request(app)
      .post(`${A}/2fa/verify`)
      .send({ mfaToken: 'x'.repeat(40), code: '123456' })
      .expect(401);
  });

  it('turns off with a valid code', async () => {
    const u = await registerUser(app, 'turnoff');
    const { recovery } = await enroll(u);
    await request(app).post(`${A}/2fa/disable`).set(auth(u)).send({ code: '123456' }).expect(400);
    await request(app)
      .post(`${A}/2fa/disable`)
      .set(auth(u))
      .send({ code: recovery[3] })
      .expect(204);
    const l = await login('turnoff').expect(200);
    expect(l.body.accessToken).toEqual(expect.any(String));
  });
});
