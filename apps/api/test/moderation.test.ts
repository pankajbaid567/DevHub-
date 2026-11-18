import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { ModerationItemDto } from '@devhub/shared';
import {
  assertLedgerConsistent,
  auth,
  createQuestion,
  createTestApp,
  registerUser,
  resetDb,
  settle,
  type TestUser,
} from './helpers.js';

const { c, app, ai } = createTestApp();

beforeEach(async () => {
  await resetDb(c);
  await c.cache.del();
  ai.calls.length = 0;
});
afterAll(() => c.db.$disconnect());

async function admin(): Promise<TestUser> {
  const u = await registerUser(app, `admin${Date.now() % 100_000}`);
  await c.db.user.update({ where: { id: u.id }, data: { role: 'ADMIN' } });
  // Re-login so the access token carries the ADMIN role.
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: `${u.username}@example.com`, password: 'password123' });
  return { ...u, token: res.body.accessToken };
}

const report = (u: TestUser, body: object) =>
  request(app).post('/api/v1/reports').set(auth(u)).send(body);

const verdict = (v: string, category = 'spam') =>
  JSON.stringify({ verdict: v, category, confidence: 0.9, reason: 'test verdict' });

describe('reporting', () => {
  it('accepts one report per user per item, never for your own post', async () => {
    const author = await registerUser(app);
    const reader = await registerUser(app);
    const q = await createQuestion(app, author);
    ai.reply(verdict('likely_ok', 'none'));
    await report(reader, { targetType: 'QUESTION', targetId: q.id, reason: 'SPAM' }).expect(201);
    await report(reader, { targetType: 'QUESTION', targetId: q.id, reason: 'ABUSE' }).expect(409);
    await report(author, { targetType: 'QUESTION', targetId: q.id, reason: 'SPAM' }).expect(403);
    await report(reader, { targetType: 'QUESTION', targetId: 'missing', reason: 'SPAM' }).expect(
      404,
    );
  });

  it('rate-limits reporters', async () => {
    const author = await registerUser(app);
    const reader = await registerUser(app);
    for (let i = 0; i < 10; i++) {
      const q = await createQuestion(app, author, {
        title: `Question number ${i} about Node.js streams`,
      });
      await report(reader, { targetType: 'QUESTION', targetId: q.id, reason: 'SPAM' }).expect(201);
    }
    const q = await createQuestion(app, author, {
      title: 'One more question about Node.js streams',
    });
    await report(reader, { targetType: 'QUESTION', targetId: q.id, reason: 'SPAM' }).expect(429);
  });
});

describe('moderation queue', () => {
  it('is for admins only', async () => {
    const u = await registerUser(app);
    await request(app).get('/api/v1/admin/moderation').set(auth(u)).expect(403);
    await request(app).get('/api/v1/admin/moderation').expect(401);
  });

  it('triages reports with AI in the background and puts likely violations first', async () => {
    const mod = await admin();
    const author = await registerUser(app);
    const [r1, r2, r3] = [
      await registerUser(app),
      await registerUser(app),
      await registerUser(app),
    ];
    const benign = await createQuestion(app, author, {
      title: 'How do I profile a slow Node.js service?',
    });
    const spam = await createQuestion(app, author, {
      title: 'Cheap crypto signals, buy now at my site',
      body: 'Click here for free money: https://a.example https://b.example https://c.example',
    });

    // The benign question has more reports, but the AI flags the spam one as a violation.
    ai.reply(verdict('likely_ok', 'none'), verdict('likely_violation', 'spam'));
    for (const u of [r1, r2, r3])
      await report(u, { targetType: 'QUESTION', targetId: benign.id, reason: 'OFF_TOPIC' });
    await settle(c);
    await report(r1, { targetType: 'QUESTION', targetId: spam.id, reason: 'SPAM', details: 'ads' });
    await settle(c);

    const res = await request(app).get('/api/v1/admin/moderation').set(auth(mod)).expect(200);
    const items = res.body as ModerationItemDto[];
    expect(items.map((i) => i.targetId)).toEqual([spam.id, benign.id]);
    expect(items[0]).toMatchObject({
      reportCount: 1,
      reasons: ['SPAM'],
      details: ['ads'],
      triage: { verdict: 'likely_violation', category: 'spam', model: 'fake-model' },
    });
    expect(items[1]).toMatchObject({ reportCount: 3, triage: { verdict: 'likely_ok' } });
    // One AI call per item, even with three reports on the benign question.
    const triageCalls = ai.calls.filter((call) => call.jsonSchema);
    expect(triageCalls).toHaveLength(2);
    expect(triageCalls[0]!.system).toContain('untrusted data');
  });

  it('removes an accepted answer, reversing reputation, and closes every report on it', async () => {
    const mod = await admin();
    const asker = await registerUser(app);
    const answerer = await registerUser(app);
    const [r1, r2] = [await registerUser(app), await registerUser(app)];
    const q = await createQuestion(app, asker);
    const a = await request(app)
      .post(`/api/v1/questions/${q.id}/answers`)
      .set(auth(answerer))
      .send({ body: 'Plagiarised answer copied verbatim from a blog post somewhere.' })
      .expect(201);
    await request(app)
      .put(`/api/v1/questions/${q.id}/accepted-answer`)
      .set(auth(asker))
      .send({ answerId: a.body.id })
      .expect(200);
    ai.reply(verdict('unclear', 'plagiarism'));
    for (const u of [r1, r2])
      await report(u, { targetType: 'ANSWER', targetId: a.body.id, reason: 'PLAGIARISM' });
    await settle(c);

    await request(app)
      .post('/api/v1/admin/moderation/resolve')
      .set(auth(mod))
      .send({ targetType: 'ANSWER', targetId: a.body.id, action: 'remove', note: 'copied' })
      .expect(200, { resolved: 2 });
    expect(await c.db.answer.count()).toBe(0);
    expect((await c.db.user.findUniqueOrThrow({ where: { id: answerer.id } })).reputation).toBe(0);
    await assertLedgerConsistent(c);
    const rows = await c.db.report.findMany();
    expect(rows.every((r) => r.status === 'RESOLVED' && r.resolvedById === mod.id)).toBe(true);
    expect((await request(app).get('/api/v1/admin/moderation').set(auth(mod))).body).toEqual([]);
  });

  it('dismisses reports without touching the content', async () => {
    const mod = await admin();
    const author = await registerUser(app);
    const reader = await registerUser(app);
    const q = await createQuestion(app, author);
    ai.reply(verdict('likely_ok', 'none'));
    await report(reader, { targetType: 'QUESTION', targetId: q.id, reason: 'OTHER' });
    await request(app)
      .post('/api/v1/admin/moderation/resolve')
      .set(auth(mod))
      .send({ targetType: 'QUESTION', targetId: q.id, action: 'dismiss' })
      .expect(200, { resolved: 1 });
    expect(await c.db.question.count()).toBe(1);
    await request(app)
      .post('/api/v1/admin/moderation/resolve')
      .set(auth(mod))
      .send({ targetType: 'QUESTION', targetId: q.id, action: 'dismiss' })
      .expect(404);
  });
});
