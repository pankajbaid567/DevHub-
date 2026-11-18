import request from 'supertest';
import type { Express } from 'express';
import type { AuthResponse } from '@devhub/shared';
import { loadEnv } from '../src/config/env.js';
import { createContainer, type Container } from '../src/container.js';
import { createApp } from '../src/app.js';
import type { AIProvider, GenerateRequest } from '../src/modules/ai/providers/provider.js';

/** Scriptable fake LLM: tests queue the raw text the "model" should return. */
export class FakeProvider implements AIProvider {
  readonly name = 'fake';
  readonly isDemo = false;
  readonly calls: GenerateRequest[] = [];
  private readonly queue: string[] = [];

  reply(...texts: string[]): this {
    this.queue.push(...texts);
    return this;
  }

  private next(): string {
    return this.queue.shift() ?? 'default reply';
  }

  async generate(req: GenerateRequest) {
    this.calls.push(req);
    return { text: this.next(), model: 'fake-model' };
  }

  async stream(req: GenerateRequest) {
    this.calls.push(req);
    const text = this.next();
    async function* chunks() {
      for (const part of text.split(' ')) yield `${part} `;
    }
    return { model: 'fake-model', chunks: chunks() };
  }
}

export interface TestContext {
  c: Container;
  app: Express;
  ai: FakeProvider;
}

export function createTestApp(): TestContext {
  const ai = new FakeProvider();
  const c = createContainer(loadEnv(), { aiProvider: ai, redis: null });
  const { app } = createApp(c, { disableRateLimits: true });
  return { c, app, ai };
}

const TABLES = [
  'mentor_messages',
  'mentor_conversations',
  'resume_reviews',
  'notifications',
  'messages',
  'session_participants',
  'sessions',
  'snippet_stars',
  'snippets',
  'votes',
  'reputation_events',
  'answers',
  'questions',
  'tags',
  'skill_ratings',
  'refresh_tokens',
  'users',
];

export async function resetDb(c: Container): Promise<void> {
  await c.db.$executeRawUnsafe(
    `TRUNCATE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
}

let counter = 0;

export interface TestUser {
  id: string;
  username: string;
  token: string;
  cookie: string;
}

export async function registerUser(app: Express, name?: string): Promise<TestUser> {
  const username = name ?? `user${++counter}${Date.now() % 10_000}`;
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ username, email: `${username}@example.com`, password: 'password123' })
    .expect(201);
  const body = res.body as AuthResponse;
  const setCookie = res.headers['set-cookie'] as unknown as string[];
  return {
    id: body.user.id,
    username: body.user.username,
    token: body.accessToken,
    cookie: setCookie[0]!.split(';')[0]!,
  };
}

export const auth = (u: TestUser) => ({ Authorization: `Bearer ${u.token}` });

/** Gives a user reputation directly (e.g. to pass the downvote threshold) via the ledger. */
export async function grantReputation(c: Container, userId: string, delta: number): Promise<void> {
  await c.db.$transaction([
    c.db.user.update({ where: { id: userId }, data: { reputation: { increment: delta } } }),
    c.db.reputationEvent.create({ data: { userId, delta, reason: 'ANSWER_VOTE' } }),
  ]);
}

/** The ledger invariant: cached reputation equals the sum of reputation events. */
export async function assertLedgerConsistent(c: Container): Promise<void> {
  const rows = await c.db.$queryRaw<{ id: string; reputation: number; total: bigint | null }[]>`
    SELECT u.id, u.reputation, SUM(e.delta) AS total
    FROM users u LEFT JOIN reputation_events e ON e."userId" = u.id
    GROUP BY u.id`;
  for (const r of rows) {
    if (r.reputation !== Number(r.total ?? 0)) {
      throw new Error(`ledger mismatch for ${r.id}: cached ${r.reputation}, ledger ${r.total}`);
    }
  }
}

export async function createQuestion(
  app: Express,
  u: TestUser,
  overrides: Record<string, unknown> = {},
) {
  const res = await request(app)
    .post('/api/v1/questions')
    .set(auth(u))
    .send({
      title: 'How should I structure a large Express application?',
      body: 'Looking for a layered structure that keeps controllers thin and services testable.',
      tags: ['node', 'express'],
      ...overrides,
    })
    .expect(201);
  return res.body as { id: string; title: string };
}
