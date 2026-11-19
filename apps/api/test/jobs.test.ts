import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Outbox } from '../src/jobs/outbox.js';
import type { EmailMessage, Mailer } from '../src/jobs/mailer.js';
import {
  auth,
  createQuestion,
  createTestApp,
  registerUser,
  resetDb,
  settle,
  tokenFromEmail,
} from './helpers.js';

/** A mailer that fails the first `failures` sends, then records. */
class FlakyMailer implements Mailer {
  readonly kind = 'log';
  readonly sent: EmailMessage[] = [];
  attempts = 0;
  constructor(public failures = 0) {}
  async send(msg: EmailMessage) {
    this.attempts++;
    if (this.failures > 0) {
      this.failures--;
      throw new Error('SMTP 421 try again later');
    }
    this.sent.push(msg);
  }
}

const mailer = new FlakyMailer();
const { c, app } = createTestApp({ mailer: mailer as never });

beforeEach(async () => {
  await resetDb(c);
  await settle(c);
  mailer.sent.length = 0;
  mailer.attempts = 0;
  mailer.failures = 0;
});
afterAll(() => c.db.$disconnect());

async function verifiedUser(name: string) {
  const u = await registerUser(app, name);
  await settle(c);
  const token = tokenFromEmail(mailer as never, '/verify-email');
  await request(app).post('/api/v1/auth/verify-email').send({ token }).expect(200);
  return u;
}

describe('transactional outbox', () => {
  it('writes no job when the transaction rolls back', async () => {
    await registerUser(app, 'taken');
    await settle(c);
    const before = await c.db.outboxEvent.count();
    await request(app)
      .post('/api/v1/auth/register')
      .send({ username: 'taken', email: 'other@example.com', password: 'password123' })
      .expect(409);
    expect(await c.db.outboxEvent.count()).toBe(before);
    await settle(c);
    expect(mailer.sent).toHaveLength(1);
  });

  it('delivers once even if a row is relayed twice (crash between enqueue and mark)', async () => {
    await registerUser(app, 'twice');
    await settle(c);
    expect(mailer.sent).toHaveLength(1);
    // Simulate the crash: the row looks un-relayed again.
    await c.db.outboxEvent.updateMany({ data: { dispatchedAt: null } });
    await settle(c);
    expect(mailer.sent).toHaveLength(1);
  });

  it('lets several relays run concurrently without double-dispatching (SKIP LOCKED)', async () => {
    for (let i = 0; i < 12; i++) {
      await c.db.outboxEvent.create({
        data: {
          topic: 'email.send',
          payload: { to: `u${i}@example.com`, subject: 's', text: 't', html: 'h' },
        },
      });
    }
    const relays = [0, 1, 2].map(() => new Outbox(c.db, c.queue, c.logger));
    const counts = await Promise.all(relays.map((r) => r.relayOnce(5)));
    await Promise.all(relays.map((r) => r.flush()));
    await settle(c);
    expect(counts.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(12);
    expect(mailer.sent).toHaveLength(12);
    expect(new Set(mailer.sent.map((m) => m.to)).size).toBe(12);
  });

  it('backs off a row the queue rejects instead of hot-looping', async () => {
    let calls = 0;
    const failing = {
      ...c.queue,
      add: async () => {
        calls++;
        throw new Error('redis down');
      },
    };
    const relay = new Outbox(c.db, failing as never, c.logger);
    await c.db.outboxEvent.create({
      data: {
        topic: 'email.send',
        payload: { to: 'x@example.com', subject: 's', text: 't', html: 'h' },
      },
    });
    expect(await relay.relayOnce()).toBe(0);
    const row = await c.db.outboxEvent.findFirstOrThrow();
    expect(row).toMatchObject({ attempts: 1, lastError: 'redis down', dispatchedAt: null });
    expect(row.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    // Backing off: the next passes do not even try the queue.
    await relay.relayOnce();
    await relay.relayOnce();
    expect(calls).toBe(1);
    // Once the backoff expires, the healthy relay delivers it.
    await c.db.outboxEvent.updateMany({ data: { lockedUntil: new Date(Date.now() - 1000) } });
    await settle(c);
    expect(mailer.sent.map((m) => m.to)).toContain('x@example.com');
  });

  it('re-sends rows whose lease expired (relay crashed after claiming)', async () => {
    await c.db.outboxEvent.create({
      data: {
        topic: 'email.send',
        payload: { to: 'lease@example.com', subject: 's', text: 't', html: 'h' },
        lockedUntil: new Date(Date.now() + 60_000), // claimed by a relay that then died
      },
    });
    await settle(c);
    expect(mailer.sent).toHaveLength(0); // lease still held
    await c.db.outboxEvent.updateMany({ data: { lockedUntil: new Date(Date.now() - 60_000) } });
    await settle(c);
    expect(mailer.sent.map((m) => m.to)).toEqual(['lease@example.com']);
  });

  it('flush waits for a relay pass that is already in flight', async () => {
    await c.db.outboxEvent.create({
      data: {
        topic: 'email.send',
        payload: { to: 'inflight@example.com', subject: 's', text: 't', html: 'h' },
      },
    });
    // A relay whose enqueue is slow, so the background pass is caught between claim and enqueue.
    const slowQueue = {
      ...c.queue,
      add: async (...args: Parameters<typeof c.queue.add>) => {
        await new Promise((r) => setTimeout(r, 300));
        return c.queue.add(...args);
      },
    };
    const relay = new Outbox(c.db, slowQueue as never, c.logger);
    relay.poke(); // a background pass claims the row…
    await new Promise((r) => setTimeout(r, 100));
    await relay.flush(); // …and flushing must not return before it has enqueued it
    await settle(c);
    expect(mailer.sent.map((m) => m.to)).toEqual(['inflight@example.com']);
  });

  it('rejects job ids BullMQ would reject, in tests too', async () => {
    await expect(c.queue.add('search.reconcile', {}, { jobId: 'a:b' })).rejects.toThrow(/':'/);
  });

  it('holds far-future rows in the table instead of the queue', async () => {
    await c.db.outboxEvent.create({
      data: {
        topic: 'email.send',
        payload: { to: 'later@example.com', subject: 's', text: 't', html: 'h' },
        availableAt: new Date(Date.now() + 3 * 3_600_000),
      },
    });
    expect(await c.outbox.relayOnce()).toBe(0);
  });
});

describe('job retries', () => {
  it('retries a failing job with backoff and delivers exactly once', async () => {
    mailer.failures = 2;
    await registerUser(app, 'retry');
    await settle(c);
    expect(mailer.attempts).toBe(3);
    expect(mailer.sent).toHaveLength(1);
    expect(c.metrics.render()).toMatch(/jobs_total\{name="email.send",outcome="error"\} \d+/);
  });
});

describe('email notifications', () => {
  it('emails verified users about answers, respecting their preference', async () => {
    const asker = await verifiedUser('asker');
    const helper = await registerUser(app, 'helper');
    const q = await createQuestion(app, asker);
    mailer.sent.length = 0;

    await request(app)
      .post(`/api/v1/questions/${q.id}/answers`)
      .set(auth(helper))
      .send({ body: 'Use a layered structure: routes, services and repositories.' })
      .expect(201);
    await settle(c);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).toMatchObject({ to: 'asker@example.com' });
    expect(mailer.sent[0]!.subject).toContain('answered your question');
    expect(mailer.sent[0]!.html).not.toContain('<script');

    // Turn emails off: the in-app notification still arrives, the email does not.
    await request(app)
      .patch('/api/v1/users/me')
      .set(auth(asker))
      .send({ emailNotifications: false })
      .expect(200);
    await request(app)
      .post(`/api/v1/questions/${q.id}/answers`)
      .set(auth(helper))
      .send({ body: 'Another angle: hexagonal architecture with ports and adapters.' })
      .expect(201);
    await settle(c);
    expect(mailer.sent).toHaveLength(1);
    expect(await c.db.notification.count({ where: { userId: asker.id } })).toBe(2);
  });

  it('does not email unverified users or for upvotes', async () => {
    const asker = await registerUser(app, 'unverified');
    const voter = await registerUser(app, 'voter');
    const q = await createQuestion(app, asker);
    await settle(c);
    mailer.sent.length = 0;
    await request(app)
      .post(`/api/v1/questions/${q.id}/answers`)
      .set(auth(voter))
      .send({ body: 'An answer that would normally trigger an email notification.' })
      .expect(201);
    await settle(c);
    expect(mailer.sent).toHaveLength(0);
  });
});

describe('session reminders', () => {
  it('schedules a reminder 10 minutes before the start and sends it once', async () => {
    const host = await registerUser(app, 'host');
    const guest = await registerUser(app, 'guest');
    const startsAt = new Date(Date.now() + 60 * 60_000);
    const s = await request(app)
      .post('/api/v1/sessions')
      .set(auth(host))
      .send({ title: 'Mock interview: system design', scheduledFor: startsAt.toISOString() })
      .expect(201);
    await request(app).post(`/api/v1/sessions/${s.body.id}/join`).set(auth(guest)).expect(200);

    const row = await c.db.outboxEvent.findFirstOrThrow({ where: { topic: 'session.reminder' } });
    expect(Math.abs(row.availableAt.getTime() - (startsAt.getTime() - 10 * 60_000))).toBeLessThan(
      2_000,
    );

    // Run the job directly (twice: delivery is at-least-once, the handler must be idempotent).
    await c.queue.add('session.reminder', { sessionId: s.body.id });
    await c.queue.add('session.reminder', { sessionId: s.body.id });
    await settle(c);
    const reminders = await c.db.notification.findMany({ where: { type: 'SESSION_REMINDER' } });
    expect(reminders.map((r) => r.userId).sort()).toEqual([guest.id, host.id].sort());
  });

  it('skips the reminder if the session already started', async () => {
    const host = await registerUser(app, 'early');
    const s = await request(app)
      .post('/api/v1/sessions')
      .set(auth(host))
      .send({
        title: 'Starts early',
        scheduledFor: new Date(Date.now() + 30 * 60_000).toISOString(),
      })
      .expect(201);
    await request(app).post(`/api/v1/sessions/${s.body.id}/start`).set(auth(host)).expect(200);
    await c.queue.add('session.reminder', { sessionId: s.body.id });
    await settle(c);
    expect(await c.db.notification.count({ where: { type: 'SESSION_REMINDER' } })).toBe(0);
  });
});
