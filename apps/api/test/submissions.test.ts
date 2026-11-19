import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { SubmissionDto } from '@devhub/shared';
import { createApp } from '../src/app.js';
import type { CodeRunner } from '../src/modules/runs/runner.client.js';
import { auth, createTestApp, registerUser, resetDb, type TestUser } from './helpers.js';

/** Executes code with the local interpreters (the real sandbox adds limits, not semantics). */
const localRunner: CodeRunner = {
  enabled: true,
  async run({ language, code }) {
    const dir = await mkdtemp(join(tmpdir(), 'sub-'));
    const file = join(dir, language === 'python' ? 'main.py' : 'main.js');
    await writeFile(file, code);
    const started = Date.now();
    const [cmd, args] =
      language === 'python' ? ['python3', ['-I', '-B', file]] : [process.execPath, [file]];
    return new Promise((resolve) => {
      execFile(cmd, args, { timeout: 10_000 }, (err, stdout, stderr) => {
        void rm(dir, { recursive: true, force: true });
        const e = err as (NodeJS.ErrnoException & { killed?: boolean; code?: number }) | null;
        resolve({
          status: e?.killed ? 'timeout' : e ? 'error' : 'ok',
          stdout,
          stderr,
          exitCode: e ? (typeof e.code === 'number' ? e.code : 1) : 0,
          durationMs: Date.now() - started,
        });
      });
    });
  },
};

const { c, ai } = createTestApp({ codeRunner: localRunner });
const broadcasts: SubmissionDto[] = [];
const { app } = createApp(c, {
  disableRateLimits: true,
  broadcaster: {
    status: () => {},
    message: () => {},
    runStarted: () => {},
    runFinished: () => {},
    interview: () => {},
    submission: (s) => broadcasts.push(s),
  },
});
afterAll(() => c.db.$disconnect());

let host: TestUser;
let guest: TestUser;
beforeEach(async () => {
  await resetDb(c);
  broadcasts.length = 0;
  host = await registerUser(app, 'host');
  guest = await registerUser(app, 'guest');
});

async function interview(problem: object, withGuest = true) {
  const s = await request(app)
    .post('/api/v1/sessions')
    .set(auth(host))
    .send({ title: 'Coding round', interview: problem })
    .expect(201);
  if (withGuest)
    await request(app).post(`/api/v1/sessions/${s.body.id}/join`).set(auth(guest)).expect(200);
  return s.body.id as string;
}

async function submit(id: string, u: TestUser, body: object, status = 201) {
  await c.cache.del(`run:cooldown:${u.id}`);
  return request(app)
    .post(`/api/v1/sessions/${id}/interview/submissions`)
    .set(auth(u))
    .send(body)
    .expect(status);
}

const TWO_SUM = `function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    if (seen.has(target - nums[i])) return [seen.get(target - nums[i]), i];
    seen.set(nums[i], i);
  }
}`;

describe('test submissions', () => {
  it('passes a correct solution, showing visible tests in full and hidden ones as pass/fail', async () => {
    const id = await interview({ problemSlug: 'two-sum' });
    const res = await submit(id, host, { language: 'javascript', code: TWO_SUM });
    expect(res.body).toMatchObject({
      status: 'passed',
      passed: 6,
      total: 6,
      language: 'javascript',
    });

    const visible = res.body.cases.filter((x: { hidden: boolean }) => !x.hidden);
    const hidden = res.body.cases.filter((x: { hidden: boolean }) => x.hidden);
    expect(visible[0]).toMatchObject({
      input: 'twoSum([2,7,11,15], 9)',
      expected: '[0,1]',
      actual: '[0,1]',
      passed: true,
    });
    for (const h of hidden) expect(Object.keys(h).sort()).toEqual(['hidden', 'index', 'passed']);

    // Shared with the room and kept in the history.
    expect(broadcasts.map((b) => b.id)).toEqual([res.body.id]);
    const list = await request(app)
      .get(`/api/v1/sessions/${id}/interview/submissions`)
      .set(auth(guest))
      .expect(200);
    expect(list.body.items[0]).toMatchObject({ id: res.body.id, user: { id: host.id } });
  });

  it('reports a partly wrong Python solution, with exceptions on hidden tests', async () => {
    const id = await interview({ problemSlug: 'valid-parentheses' });
    await request(app)
      .post(`/api/v1/sessions/${id}/interview`)
      .set(auth(host))
      .send({ action: 'start' })
      .expect(200);
    const res = await submit(id, guest, {
      language: 'python',
      code: `def is_valid(s):
    print("checking", len(s))
    if len(s) > 1000:
        raise RecursionError("too deep")
    return len(s) % 2 == 0`,
    });
    expect(res.body.status).toBe('failed');
    expect(res.body.passed).toBeGreaterThan(0);
    expect(res.body.passed).toBeLessThan(res.body.total);
    expect(res.body.cases.at(-1)).toMatchObject({
      hidden: true,
      passed: false,
      error: 'RecursionError: too deep',
    });
    expect(res.body.stdout).toContain('checking 6'); // its own prints, without the harness line
    expect(res.body.stdout).not.toContain('__DEVHUB_RESULTS_');
  });

  it('drives class problems through a sequence of calls', async () => {
    const id = await interview({ problemSlug: 'lru-cache' });
    const naive = `class LRUCache {
  constructor(c) { this.c = c; this.m = new Map(); }
  get(k) { return this.m.has(k) ? this.m.get(k) : -1; } // forgets to refresh recency
  put(k, v) { this.m.set(k, v); if (this.m.size > this.c) this.m.delete(this.m.keys().next().value); }
}`;
    const res = await submit(id, host, { language: 'javascript', code: naive });
    expect(res.body.status).toBe('failed');
    expect(res.body.cases[0]).toMatchObject({ hidden: false, passed: false });
    expect(res.body.cases[0].input).toMatch(/^LRUCache\(2\) → put\(1, 1\)/);
  });

  it('marks code that does not compile or run as an error, with the error output', async () => {
    const id = await interview({ problemSlug: 'two-sum' });
    const res = await submit(id, host, { language: 'javascript', code: 'function twoSum( {' });
    expect(res.body).toMatchObject({ status: 'error', passed: 0 });
    expect(res.body.stderr).toContain('SyntaxError');
  });

  it('refuses custom problems, candidates before the start, ended interviews and viewers of other sessions', async () => {
    const custom = await interview({
      customProblem: { title: 'Design a cache', statement: 'Talk through it with me.' },
    });
    await submit(custom, host, { language: 'javascript', code: 'x' }, 409);

    const id = await interview({ problemSlug: 'two-sum' });
    await submit(id, guest, { language: 'javascript', code: TWO_SUM }, 409);
    const outsider = await registerUser(app, 'outsider');
    await submit(id, outsider, { language: 'javascript', code: TWO_SUM }, 403);

    await request(app)
      .post(`/api/v1/sessions/${id}/interview`)
      .set(auth(host))
      .send({ action: 'start' })
      .expect(200);
    await request(app)
      .post(`/api/v1/sessions/${id}/interview`)
      .set(auth(host))
      .send({ action: 'end' })
      .expect(200);
    await submit(id, guest, { language: 'javascript', code: TWO_SUM }, 409);
    await submit(id, host, { language: 'ruby', code: 'puts 1' }, 400);
  });
});

describe('interview history', () => {
  it('lists your interviews by role, with your best test run, feedback and private recommendation', async () => {
    // 1. You interview someone and record a recommendation.
    const asInterviewer = await interview({ problemSlug: 'two-sum' });
    await request(app)
      .put(`/api/v1/sessions/${asInterviewer}/interview/scorecard`)
      .set(auth(host))
      .send({ recommendation: 'STRONG_YES' })
      .expect(200);
    // 2. You practise alone: two runs (best one counts) and AI feedback.
    const practice = await interview({ problemSlug: 'two-sum' }, false);
    await submit(practice, host, {
      language: 'javascript',
      code: 'function twoSum() { return [0, 1]; }',
    });
    await submit(practice, host, { language: 'javascript', code: TWO_SUM });
    ai.reply(
      JSON.stringify({
        scores: { problemSolving: 4, codeQuality: 3, communication: 3, testing: 2 },
        strengths: [],
        improvements: [],
        summary: 'Good.',
        recommendation: 'YES',
      }),
    );
    await c.cache.del(`feedback:cooldown:${host.id}`);
    await request(app)
      .post(`/api/v1/sessions/${practice}/interview/feedback`)
      .set(auth(host))
      .send({
        transcript: [
          { role: 'interviewer', text: 'Approach?' },
          { role: 'candidate', text: 'A hash map.' },
        ],
      })
      .expect(201);
    // 3. Someone else interviews you.
    const other = await request(app)
      .post('/api/v1/sessions')
      .set(auth(guest))
      .send({ title: 'Their round', interview: { problemSlug: 'merge-intervals' } })
      .expect(201);
    await request(app).post(`/api/v1/sessions/${other.body.id}/join`).set(auth(host)).expect(200);
    // A pairing session is not an interview.
    await request(app)
      .post('/api/v1/sessions')
      .set(auth(host))
      .send({ title: 'Pairing' })
      .expect(201);

    const res = await request(app)
      .get('/api/v1/sessions/interview/history')
      .set(auth(host))
      .expect(200);
    const byId = Object.fromEntries(
      res.body.items.map((i: { sessionId: string }) => [i.sessionId, i]),
    );
    expect(res.body.items).toHaveLength(3);
    expect(byId[asInterviewer]).toMatchObject({
      role: 'interviewer',
      myRecommendation: 'STRONG_YES',
      bestSubmission: null,
      feedback: null,
    });
    expect(byId[practice]).toMatchObject({
      role: 'practice',
      problemTitle: 'Two Sum',
      difficulty: 'Easy',
      bestSubmission: { passed: 6, total: 6 },
      feedback: { average: 3, recommendation: 'YES' },
    });
    expect(byId[other.body.id]).toMatchObject({ role: 'candidate', myRecommendation: null });
    expect(res.body.stats).toEqual({
      interviews: 3,
      asCandidate: 1,
      asInterviewer: 1,
      practice: 1,
      averageScore: 3,
      solvedRate: 1,
    });

    // The guest sees their own view: none of the host's runs, feedback or recommendation.
    const theirs = await request(app)
      .get('/api/v1/sessions/interview/history')
      .set(auth(guest))
      .expect(200);
    expect(theirs.body.items).toHaveLength(2);
    expect(JSON.stringify(theirs.body)).not.toContain('STRONG_YES');
    expect(theirs.body.stats.averageScore).toBeNull();
  });
});
