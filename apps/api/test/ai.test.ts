import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { MentorStreamEvent } from '@devhub/shared';
import { auth, createTestApp, registerUser, resetDb } from './helpers.js';

const { c, app, ai } = createTestApp();

beforeEach(() => resetDb(c));
afterAll(() => c.db.$disconnect());

const parseSse = (raw: string): MentorStreamEvent[] =>
  raw
    .split('\n\n')
    .filter((l) => l.startsWith('data: '))
    .map((l) => JSON.parse(l.slice(6)) as MentorStreamEvent);

const validReview = {
  overallScore: 72,
  summary: 'Solid backend experience; quantify impact more.',
  sections: [
    { name: 'Experience', score: 70, strengths: ['Relevant stack'], improvements: ['Add metrics'] },
  ],
  atsKeywords: { present: ['node'], missing: ['kubernetes'] },
  topActions: ['Quantify achievements'],
};

const resumeText =
  'Software engineer with 3 years building Node.js and TypeScript services. '.repeat(5);

describe('AI mentor', () => {
  it('streams a reply as server-sent events and stores both sides of the conversation', async () => {
    const u = await registerUser(app);
    const convo = await request(app)
      .post('/api/v1/ai/conversations')
      .set(auth(u))
      .send({ topic: 'debugging' })
      .expect(201);
    ai.reply('Check the event loop for blocking work.', 'Event loop debugging');

    const res = await request(app)
      .post(`/api/v1/ai/conversations/${convo.body.id}/messages`)
      .set(auth(u))
      .send({ content: 'My API is slow under load' })
      .buffer(true)
      .parse((r, cb) => {
        let data = '';
        r.on('data', (chunk: Buffer) => (data += chunk.toString()));
        r.on('end', () => cb(null, data));
      })
      .expect(200);

    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    const events = parseSse(res.body as string);
    expect(events[0]).toMatchObject({ type: 'start', model: 'fake-model' });
    expect(
      events
        .filter((e) => e.type === 'delta')
        .map((e) => (e as { text: string }).text)
        .join('')
        .trim(),
    ).toBe('Check the event loop for blocking work.');
    expect(events.at(-1)).toMatchObject({ type: 'done', title: 'Event loop debugging' });

    const stored = await request(app)
      .get(`/api/v1/ai/conversations/${convo.body.id}`)
      .set(auth(u))
      .expect(200);
    expect(stored.body.title).toBe('Event loop debugging');
    expect(stored.body.messages.map((m: { role: string }) => m.role)).toEqual([
      'user',
      'assistant',
    ]);
    // The system prompt is separate from user content (prompt-injection hygiene).
    expect(ai.calls[0]!.system).toMatch(/Focus: Help debug/);
    expect(ai.calls[0]!.turns.at(-1)).toEqual({
      role: 'user',
      content: 'My API is slow under load',
    });
  });

  it("returns a JSON 404 (not a broken stream) for someone else's conversation", async () => {
    const owner = await registerUser(app);
    const intruder = await registerUser(app);
    const convo = await request(app)
      .post('/api/v1/ai/conversations')
      .set(auth(owner))
      .send({})
      .expect(201);
    await request(app)
      .post(`/api/v1/ai/conversations/${convo.body.id}/messages`)
      .set(auth(intruder))
      .send({ content: 'hi' })
      .expect(404);
    await request(app)
      .get(`/api/v1/ai/conversations/${convo.body.id}`)
      .set(auth(intruder))
      .expect(404);
  });
});

describe('structured AI output', () => {
  it('validates model JSON, retries once on malformed output, and stores the review', async () => {
    const u = await registerUser(app);
    ai.reply('{"overallScore": "not a number"}', JSON.stringify(validReview));
    const res = await request(app)
      .post('/api/v1/ai/resume-reviews')
      .set(auth(u))
      .send({ text: resumeText, targetRole: 'Backend engineer' })
      .expect(201);
    expect(res.body.result).toEqual(validReview);
    expect(res.body.targetRole).toBe('Backend engineer');
    const history = await request(app).get('/api/v1/ai/resume-reviews').set(auth(u)).expect(200);
    expect(history.body).toHaveLength(1);
  });

  it('fails with 503 AI_UNAVAILABLE instead of storing invalid output', async () => {
    const u = await registerUser(app);
    ai.reply('nonsense', 'still nonsense');
    const res = await request(app)
      .post('/api/v1/ai/resume-reviews')
      .set(auth(u))
      .send({ text: resumeText })
      .expect(503);
    expect(res.body.error.code).toBe('AI_UNAVAILABLE');
    expect(await c.db.resumeReview.count()).toBe(0);
  });

  it('rejects uploads that are not real PDFs, checking magic bytes and not just the MIME type', async () => {
    const u = await registerUser(app);
    const res = await request(app)
      .post('/api/v1/ai/resume-reviews')
      .set(auth(u))
      .attach('file', Buffer.from('<script>alert(1)</script>'), {
        filename: 'cv.pdf',
        contentType: 'application/pdf',
      })
      .expect(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    await request(app)
      .post('/api/v1/ai/resume-reviews')
      .set(auth(u))
      .attach('file', Buffer.from('hello'), { filename: 'cv.txt', contentType: 'text/plain' })
      .expect(415);
  });
});

describe('platform behaviour', () => {
  it('serves an OpenAPI document generated from the route definitions', async () => {
    const res = await request(app).get('/openapi.json').expect(200);
    expect(res.body.openapi).toBe('3.0.3');
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining([
        '/api/v1/questions',
        '/api/v1/questions/{id}/vote',
        '/api/v1/ai/conversations/{id}/messages',
      ]),
    );
  });

  it('returns uniform error bodies with a request id', async () => {
    const res = await request(app).get('/api/v1/does-not-exist').expect(404);
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND' });
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
    const bad = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"broken json')
      .expect(400);
    expect(bad.body.error.message).toBe('Malformed JSON body');
  });

  it('sets security headers and reports readiness', async () => {
    const res = await request(app).get('/ready').expect(200);
    expect(res.body.checks.database).toBe('ok');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('exposes Prometheus metrics labelled by route pattern', async () => {
    await request(app).get('/api/v1/questions');
    const res = await request(app).get('/metrics').expect(200);
    expect(res.text).toContain(
      'http_requests_total{method="GET",route="/api/v1/questions/",status="200"}',
    );
  });
});
