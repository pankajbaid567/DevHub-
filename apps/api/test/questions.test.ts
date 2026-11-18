import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { REPUTATION } from '@devhub/shared';
import {
  assertLedgerConsistent,
  auth,
  createQuestion,
  createTestApp,
  grantReputation,
  registerUser,
  resetDb,
} from './helpers.js';

const { c, app } = createTestApp();
const Q = '/api/v1/questions';

beforeEach(() => resetDb(c));
afterAll(() => c.db.$disconnect());

const rep = async (id: string) => (await c.db.user.findUniqueOrThrow({ where: { id } })).reputation;

describe('questions: CRUD and listing', () => {
  it('creates, lists with pagination meta, and filters by tag', async () => {
    const u = await registerUser(app);
    await createQuestion(app, u, { tags: ['react'] });
    await createQuestion(app, u, { tags: ['go'], title: 'Goroutines leaking in my worker pool?' });
    const all = await request(app).get(Q).expect(200);
    expect(all.body.meta).toMatchObject({ page: 1, total: 2, totalPages: 1 });
    const go = await request(app).get(`${Q}?tag=go`).expect(200);
    expect(go.body.items).toHaveLength(1);
    expect(go.body.items[0].tags).toEqual(['go']);
  });

  it('full-text search ranks by relevance and handles stemming', async () => {
    const u = await registerUser(app);
    await createQuestion(app, u, { title: 'Debouncing inputs in React hooks', tags: ['react'] });
    await createQuestion(app, u, {
      title: 'Indexing strategy for Postgres',
      body: 'Which indexes speed up range queries on timestamps in Postgres tables?',
      tags: ['postgres'],
    });
    const res = await request(app).get(`${Q}?q=debounce`).expect(200);
    expect(res.body.items.map((i: { title: string }) => i.title)).toEqual([
      'Debouncing inputs in React hooks',
    ]);
  });

  it('caps page size and rejects nonsense query params', async () => {
    await request(app).get(`${Q}?limit=500`).expect(400);
    await request(app).get(`${Q}?sort=random`).expect(400);
  });

  it('only lets the author edit or delete', async () => {
    const author = await registerUser(app);
    const other = await registerUser(app);
    const q = await createQuestion(app, author);
    await request(app)
      .patch(`${Q}/${q.id}`)
      .set(auth(other))
      .send({ title: 'A hijacked title for this question' })
      .expect(403);
    await request(app).delete(`${Q}/${q.id}`).set(auth(other)).expect(403);
    await request(app)
      .patch(`${Q}/${q.id}`)
      .set(auth(author))
      .send({ tags: ['node'] })
      .expect(200);
    await request(app).delete(`${Q}/${q.id}`).set(auth(author)).expect(204);
    await request(app).get(`${Q}/${q.id}`).expect(404);
  });

  it('counts a view once per viewer', async () => {
    const u = await registerUser(app);
    const q = await createQuestion(app, u);
    await request(app).get(`${Q}/${q.id}`).set(auth(u));
    const second = await request(app).get(`${Q}/${q.id}`).set(auth(u)).expect(200);
    expect(second.body.viewCount).toBe(1);
  });

  it('keeps answerCount in sync and notifies the asker', async () => {
    const asker = await registerUser(app);
    const answerer = await registerUser(app);
    const q = await createQuestion(app, asker);
    await request(app)
      .post(`${Q}/${q.id}/answers`)
      .set(auth(answerer))
      .send({ body: 'Split into routes, services and repositories.' })
      .expect(201);
    const detail = await request(app).get(`${Q}/${q.id}`).expect(200);
    expect(detail.body.answerCount).toBe(1);
    await new Promise((r) => setTimeout(r, 50)); // notification is published after commit
    const notes = await request(app).get('/api/v1/notifications').set(auth(asker)).expect(200);
    expect(notes.body.unread).toBe(1);
    expect(notes.body.items[0].type).toBe('ANSWER_POSTED');
  });
});

describe('voting and reputation', () => {
  it('is idempotent, supports switching and retracting, and keeps the ledger consistent', async () => {
    const author = await registerUser(app);
    const voter = await registerUser(app);
    await grantReputation(c, voter.id, 20);
    const q = await createQuestion(app, author);
    const vote = (value: number) =>
      request(app).post(`${Q}/${q.id}/vote`).set(auth(voter)).send({ value }).expect(200);

    expect((await vote(1)).body).toEqual({ score: 1, myVote: 1 });
    expect((await vote(1)).body).toEqual({ score: 1, myVote: 1 });
    expect(await rep(author.id)).toBe(REPUTATION.QUESTION_UPVOTED);

    expect((await vote(-1)).body.score).toBe(-1);
    expect(await rep(author.id)).toBe(REPUTATION.QUESTION_DOWNVOTED);

    expect((await vote(0)).body.score).toBe(0);
    expect(await rep(author.id)).toBe(0);
    await assertLedgerConsistent(c);
  });

  it('forbids self-votes and gates downvotes on reputation', async () => {
    const author = await registerUser(app);
    const newbie = await registerUser(app);
    const q = await createQuestion(app, author);
    await request(app).post(`${Q}/${q.id}/vote`).set(auth(author)).send({ value: 1 }).expect(403);
    const res = await request(app)
      .post(`${Q}/${q.id}/vote`)
      .set(auth(newbie))
      .send({ value: -1 })
      .expect(403);
    expect(res.body.error.message).toMatch(/reputation/);
  });

  it('survives concurrent duplicate votes from the same user (unique constraint + retry)', async () => {
    const author = await registerUser(app);
    const voter = await registerUser(app);
    const q = await createQuestion(app, author);
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        request(app).post(`${Q}/${q.id}/vote`).set(auth(voter)).send({ value: 1 }),
      ),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    const row = await c.db.question.findUniqueOrThrow({ where: { id: q.id } });
    expect(row.score).toBe(1);
    expect(await c.db.vote.count()).toBe(1);
    expect(await rep(author.id)).toBe(REPUTATION.QUESTION_UPVOTED);
    await assertLedgerConsistent(c);
  });

  it('stays consistent under a burst of mixed votes and retractions from one user', async () => {
    // Regression: found by the k6 load test. Concurrent retractions raced (500 on a
    // double delete) and could apply deltas from a stale previous vote.
    const author = await registerUser(app);
    const voter = await registerUser(app);
    await grantReputation(c, voter.id, 20); // allowed to downvote
    const q = await createQuestion(app, author);
    for (let round = 0; round < 5; round++) {
      const values = Array.from({ length: 12 }, (_, i) => [1, 0, -1][(i + round) % 3]!);
      const results = await Promise.all(
        values.map((value) =>
          request(app).post(`${Q}/${q.id}/vote`).set(auth(voter)).send({ value }),
        ),
      );
      expect(results.map((r) => r.status).filter((s) => s !== 200)).toEqual([]);
      const vote = await c.db.vote.findFirst({ where: { userId: voter.id } });
      const row = await c.db.question.findUniqueOrThrow({ where: { id: q.id } });
      expect(row.score).toBe(vote?.value ?? 0); // score always matches the surviving vote
      await assertLedgerConsistent(c);
    }
  });

  it('charges the voter for answer downvotes', async () => {
    const asker = await registerUser(app);
    const answerer = await registerUser(app);
    const critic = await registerUser(app);
    await grantReputation(c, critic.id, 20);
    const q = await createQuestion(app, asker);
    const a = await request(app)
      .post(`${Q}/${q.id}/answers`)
      .set(auth(answerer))
      .send({ body: 'An answer that could be better.' });
    await request(app)
      .post(`/api/v1/answers/${a.body.id}/vote`)
      .set(auth(critic))
      .send({ value: -1 })
      .expect(200);
    expect(await rep(critic.id)).toBe(20 + REPUTATION.DOWNVOTE_COST);
    expect(await rep(answerer.id)).toBe(REPUTATION.ANSWER_DOWNVOTED);
    await assertLedgerConsistent(c);
  });
});

describe('accepted answers', () => {
  it('moves the acceptance bonus when the asker switches answers, and reverses it on delete', async () => {
    const asker = await registerUser(app);
    const a1 = await registerUser(app);
    const a2 = await registerUser(app);
    const q = await createQuestion(app, asker);
    const ans1 = await request(app)
      .post(`${Q}/${q.id}/answers`)
      .set(auth(a1))
      .send({ body: 'First good answer here.' });
    const ans2 = await request(app)
      .post(`${Q}/${q.id}/answers`)
      .set(auth(a2))
      .send({ body: 'Second, better answer here.' });
    const accept = (answerId: string | null) =>
      request(app).put(`${Q}/${q.id}/accepted-answer`).set(auth(asker)).send({ answerId });

    await accept(ans1.body.id).expect(200);
    expect(await rep(a1.id)).toBe(REPUTATION.ANSWER_ACCEPTED);

    await accept(ans2.body.id).expect(200);
    expect(await rep(a1.id)).toBe(0);
    expect(await rep(a2.id)).toBe(REPUTATION.ANSWER_ACCEPTED);

    const detail = await request(app).get(`${Q}/${q.id}`).expect(200);
    expect(detail.body.answers[0].id).toBe(ans2.body.id); // accepted answer pinned first
    expect(detail.body.hasAcceptedAnswer).toBe(true);

    await request(app).delete(`/api/v1/answers/${ans2.body.id}`).set(auth(a2)).expect(204);
    expect(await rep(a2.id)).toBe(0);
    const after = await request(app).get(`${Q}/${q.id}`).expect(200);
    expect(after.body.acceptedAnswerId).toBeNull();
    expect(after.body.answerCount).toBe(1);
    await assertLedgerConsistent(c);
  });

  it('only the asker can accept, and self-accepted answers earn nothing', async () => {
    const asker = await registerUser(app);
    const other = await registerUser(app);
    const q = await createQuestion(app, asker);
    const own = await request(app)
      .post(`${Q}/${q.id}/answers`)
      .set(auth(asker))
      .send({ body: 'Answering my own question.' });
    await request(app)
      .put(`${Q}/${q.id}/accepted-answer`)
      .set(auth(other))
      .send({ answerId: own.body.id })
      .expect(403);
    await request(app)
      .put(`${Q}/${q.id}/accepted-answer`)
      .set(auth(asker))
      .send({ answerId: own.body.id })
      .expect(200);
    expect(await rep(asker.id)).toBe(0);
  });
});
