import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { auth, createTestApp, registerUser, resetDb, type TestUser } from './helpers.js';

const { c, app } = createTestApp();
afterAll(() => c.db.$disconnect());

let interviewer: TestUser;
let candidate: TestUser;
beforeEach(async () => {
  await resetDb(c);
  interviewer = await registerUser(app, 'interviewer');
  candidate = await registerUser(app, 'candidate');
});

const proctoring = {
  enabled: true,
  requireCamera: true,
  requireScreenShare: true,
  enforceFullscreen: true,
  blockCopyPaste: true,
};

async function proctoredSession() {
  const s = await request(app)
    .post('/api/v1/sessions')
    .set(auth(interviewer))
    .send({
      title: 'Proctored interview',
      visibility: 'PUBLIC',
      interview: { problemSlug: 'two-sum', proctoring },
    })
    .expect(201);
  await request(app).post(`/api/v1/sessions/${s.body.id}/join`).set(auth(candidate)).expect(200);
  return s.body.id as string;
}

async function startInterview(id: string) {
  await request(app)
    .post(`/api/v1/sessions/${id}/interview`)
    .set(auth(interviewer))
    .send({ action: 'start' })
    .expect(200);
}

describe('proctoring setup', () => {
  it('stores proctoring config on the session and returns it in interview state', async () => {
    const id = await proctoredSession();
    const res = await request(app)
      .get(`/api/v1/sessions/${id}`)
      .set(auth(interviewer))
      .expect(200);
    expect(res.body.interview.proctoring).toMatchObject({
      enabled: true,
      requireCamera: true,
      enforceFullscreen: true,
      blockCopyPaste: true,
    });
  });

  it('returns null proctoring when not configured', async () => {
    const s = await request(app)
      .post('/api/v1/sessions')
      .set(auth(interviewer))
      .send({
        title: 'Non-proctored interview',
        visibility: 'PUBLIC',
        interview: { problemSlug: 'two-sum' },
      })
      .expect(201);
    const res = await request(app)
      .get(`/api/v1/sessions/${s.body.id}`)
      .set(auth(interviewer))
      .expect(200);
    expect(res.body.interview.proctoring).toBeNull();
  });
});

describe('proctoring events (REST)', () => {
  it('records a violation event from the candidate', async () => {
    const id = await proctoredSession();
    await startInterview(id);

    const res = await request(app)
      .post(`/api/v1/sessions/${id}/interview/proctoring/events`)
      .set(auth(candidate))
      .send({ type: 'TAB_SWITCH', detail: 'switched to another tab' })
      .expect(201);

    expect(res.body).toMatchObject({
      type: 'TAB_SWITCH',
      detail: 'switched to another tab',
      sessionId: id,
      userId: candidate.id,
    });
    expect(res.body.id).toBeDefined();
  });

  it('rejects an invalid event type', async () => {
    const id = await proctoredSession();
    await startInterview(id);

    await request(app)
      .post(`/api/v1/sessions/${id}/interview/proctoring/events`)
      .set(auth(candidate))
      .send({ type: 'INVALID_TYPE' })
      .expect(400);
  });

  it('rejects events on non-interview sessions', async () => {
    const s = await request(app)
      .post('/api/v1/sessions')
      .set(auth(interviewer))
      .send({ title: 'Pairing', visibility: 'PUBLIC' })
      .expect(201);
    await request(app)
      .post(`/api/v1/sessions/${s.body.id}/join`)
      .set(auth(candidate))
      .expect(200);

    await request(app)
      .post(`/api/v1/sessions/${s.body.id}/interview/proctoring/events`)
      .set(auth(candidate))
      .send({ type: 'TAB_SWITCH' })
      .expect(403);
  });

  it('rejects events on non-proctored interview sessions', async () => {
    const s = await request(app)
      .post('/api/v1/sessions')
      .set(auth(interviewer))
      .send({
        title: 'No proctor',
        visibility: 'PUBLIC',
        interview: { problemSlug: 'two-sum' },
      })
      .expect(201);
    await request(app)
      .post(`/api/v1/sessions/${s.body.id}/join`)
      .set(auth(candidate))
      .expect(200);
    await request(app)
      .post(`/api/v1/sessions/${s.body.id}/interview`)
      .set(auth(interviewer))
      .send({ action: 'start' })
      .expect(200);

    await request(app)
      .post(`/api/v1/sessions/${s.body.id}/interview/proctoring/events`)
      .set(auth(candidate))
      .send({ type: 'TAB_SWITCH' })
      .expect(403);
  });
});

describe('proctoring status (GET)', () => {
  it('returns events and violation count for the interviewer', async () => {
    const id = await proctoredSession();
    await startInterview(id);

    // Record two events
    await request(app)
      .post(`/api/v1/sessions/${id}/interview/proctoring/events`)
      .set(auth(candidate))
      .send({ type: 'TAB_SWITCH' })
      .expect(201);
    await request(app)
      .post(`/api/v1/sessions/${id}/interview/proctoring/events`)
      .set(auth(candidate))
      .send({ type: 'FULLSCREEN_EXIT', detail: 'exited fullscreen' })
      .expect(201);

    const res = await request(app)
      .get(`/api/v1/sessions/${id}/interview/proctoring`)
      .set(auth(interviewer))
      .expect(200);

    expect(res.body.violations).toBe(2);
    expect(res.body.events).toHaveLength(2);
    expect(res.body.config).toMatchObject({ enabled: true });
    expect(res.body.events[0]).toMatchObject({ type: 'TAB_SWITCH' });
  });

  it('denies status to non-interviewer (candidate)', async () => {
    const id = await proctoredSession();
    await request(app)
      .get(`/api/v1/sessions/${id}/interview/proctoring`)
      .set(auth(candidate))
      .expect(403);
  });

  it('requires authentication', async () => {
    const id = await proctoredSession();
    await request(app)
      .get(`/api/v1/sessions/${id}/interview/proctoring`)
      .expect(401);
  });
});

describe('proctoring rate limiting', () => {
  it('drops events beyond the per-session cap', async () => {
    const id = await proctoredSession();
    await startInterview(id);

    // Directly insert events near the cap (200) to avoid slow HTTP calls
    const batch = Array.from({ length: 199 }, (_, i) => ({
      sessionId: id,
      userId: candidate.id,
      type: 'TAB_SWITCH',
      detail: `event-${i}`,
    }));
    await c.db.proctoringEvent.createMany({ data: batch });

    // Event 200 should still be accepted
    await request(app)
      .post(`/api/v1/sessions/${id}/interview/proctoring/events`)
      .set(auth(candidate))
      .send({ type: 'TAB_SWITCH', detail: 'at the limit' })
      .expect(201)
      .then((r) => expect(r.body.id).not.toBe('dropped'));

    // Event 201 should be silently dropped
    const dropped = await request(app)
      .post(`/api/v1/sessions/${id}/interview/proctoring/events`)
      .set(auth(candidate))
      .send({ type: 'TAB_SWITCH', detail: 'over the limit' })
      .expect(201);
    expect(dropped.body.id).toBe('dropped');
  });
});
