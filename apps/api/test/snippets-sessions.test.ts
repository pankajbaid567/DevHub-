import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { auth, createTestApp, registerUser, resetDb, type TestUser } from './helpers.js';

const { c, app } = createTestApp();

beforeEach(() => resetDb(c));
afterAll(() => c.db.$disconnect());

const snippet = (u: TestUser, visibility = 'PUBLIC', title = 'useDebounce hook') =>
  request(app)
    .post('/api/v1/snippets')
    .set(auth(u))
    .send({
      title,
      code: 'export const x = 1;',
      language: 'typescript',
      tags: ['react'],
      visibility,
    })
    .expect(201);

describe('snippets', () => {
  it('hides private snippets from others (404, not 403) and keeps unlisted ones out of listings', async () => {
    const owner = await registerUser(app);
    const other = await registerUser(app);
    const priv = await snippet(owner, 'PRIVATE', 'secret');
    const unlisted = await snippet(owner, 'UNLISTED', 'by link only');
    await snippet(owner, 'PUBLIC', 'for everyone');

    await request(app).get(`/api/v1/snippets/${priv.body.id}`).set(auth(other)).expect(404);
    await request(app).get(`/api/v1/snippets/${priv.body.id}`).set(auth(owner)).expect(200);
    await request(app).get(`/api/v1/snippets/${unlisted.body.id}`).expect(200);

    const list = await request(app).get('/api/v1/snippets').expect(200);
    expect(list.body.items.map((s: { title: string }) => s.title)).toEqual(['for everyone']);
    expect(list.body.items[0].preview).toBeDefined();
    expect(list.body.items[0].code).toBeUndefined();
  });

  it('stars idempotently and keeps the counter exact', async () => {
    const owner = await registerUser(app);
    const fan = await registerUser(app);
    const s = await snippet(owner);
    const star = () =>
      request(app).put(`/api/v1/snippets/${s.body.id}/star`).set(auth(fan)).expect(200);
    await Promise.all([star(), star(), star()]);
    expect((await star()).body).toEqual({ starCount: 1, starredByMe: true });
    const unstar = await request(app)
      .delete(`/api/v1/snippets/${s.body.id}/star`)
      .set(auth(fan))
      .expect(200);
    expect(unstar.body.starCount).toBe(0);
  });

  it('forks with attribution and counts forks', async () => {
    const owner = await registerUser(app);
    const forker = await registerUser(app);
    const s = await snippet(owner);
    const fork = await request(app)
      .post(`/api/v1/snippets/${s.body.id}/fork`)
      .set(auth(forker))
      .expect(201);
    expect(fork.body.forkedFrom).toEqual({ id: s.body.id, title: 'useDebounce hook' });
    expect(fork.body.author.id).toBe(forker.id);
    const original = await request(app).get(`/api/v1/snippets/${s.body.id}`).expect(200);
    expect(original.body.forkCount).toBe(1);
  });
});

describe('sessions', () => {
  const create = (u: TestUser, body: Record<string, unknown> = {}) =>
    request(app)
      .post('/api/v1/sessions')
      .set(auth(u))
      .send({ title: 'Pairing on a LRU cache', ...body })
      .expect(201);

  it('requires the invite code for private sessions and never reveals them', async () => {
    const host = await registerUser(app);
    const guest = await registerUser(app);
    const s = await create(host, { visibility: 'PRIVATE' });
    expect(s.body.inviteCode).toMatch(/^[A-Z2-9]{10}$/);

    await request(app).get(`/api/v1/sessions/${s.body.id}`).set(auth(guest)).expect(404);
    await request(app)
      .post(`/api/v1/sessions/${s.body.id}/join`)
      .set(auth(guest))
      .send({ inviteCode: 'WRONGCODE1' })
      .expect(404);
    const listed = await request(app).get('/api/v1/sessions').expect(200);
    expect(listed.body.items).toHaveLength(0);

    const joined = await request(app)
      .post(`/api/v1/sessions/${s.body.id}/join`)
      .set(auth(guest))
      .send({ inviteCode: s.body.inviteCode.toLowerCase() })
      .expect(200);
    expect(joined.body.myRole).toBe('EDITOR');
    expect(joined.body.inviteCode).toBeUndefined(); // only the host sees it
  });

  it('enforces capacity under concurrent joins (row lock)', async () => {
    const host = await registerUser(app);
    const s = await create(host, { maxParticipants: 3 });
    const guests = await Promise.all(Array.from({ length: 6 }, () => registerUser(app)));
    const results = await Promise.all(
      guests.map((g) =>
        request(app).post(`/api/v1/sessions/${s.body.id}/join`).set(auth(g)).send({}),
      ),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(2); // host + 2 = capacity 3
    expect(
      results.filter((r) => r.status === 409).every((r) => r.body.error.code === 'SESSION_FULL'),
    ).toBe(true);
    expect(await c.db.sessionParticipant.count({ where: { sessionId: s.body.id } })).toBe(3);
  });

  it('lets only the host end a session, after which chat is closed', async () => {
    const host = await registerUser(app);
    const guest = await registerUser(app);
    const s = await create(host);
    await request(app)
      .post(`/api/v1/sessions/${s.body.id}/join`)
      .set(auth(guest))
      .send({})
      .expect(200);
    await request(app)
      .post(`/api/v1/sessions/${s.body.id}/messages`)
      .set(auth(guest))
      .send({ content: 'hello!' })
      .expect(201);
    await request(app).post(`/api/v1/sessions/${s.body.id}/end`).set(auth(guest)).expect(403);
    await request(app).post(`/api/v1/sessions/${s.body.id}/end`).set(auth(host)).expect(200);
    const late = await request(app)
      .post(`/api/v1/sessions/${s.body.id}/messages`)
      .set(auth(guest))
      .send({ content: 'too late' })
      .expect(409);
    expect(late.body.error.code).toBe('SESSION_NOT_LIVE');
  });

  it('paginates chat history with a stable cursor', async () => {
    const host = await registerUser(app);
    const s = await create(host);
    for (let i = 1; i <= 5; i++) {
      await request(app)
        .post(`/api/v1/sessions/${s.body.id}/messages`)
        .set(auth(host))
        .send({ content: `m${i}` });
    }
    const p1 = await request(app)
      .get(`/api/v1/sessions/${s.body.id}/messages?limit=2`)
      .set(auth(host))
      .expect(200);
    expect(p1.body.items.map((m: { content: string }) => m.content)).toEqual(['m5', 'm4']);
    const p2 = await request(app)
      .get(`/api/v1/sessions/${s.body.id}/messages?limit=2&cursor=${p1.body.nextCursor}`)
      .set(auth(host))
      .expect(200);
    expect(p2.body.items.map((m: { content: string }) => m.content)).toEqual(['m3', 'm2']);
  });

  it('blocks non-participants from reading chat', async () => {
    const host = await registerUser(app);
    const outsider = await registerUser(app);
    const s = await create(host);
    await request(app)
      .get(`/api/v1/sessions/${s.body.id}/messages`)
      .set(auth(outsider))
      .expect(403);
  });
});
