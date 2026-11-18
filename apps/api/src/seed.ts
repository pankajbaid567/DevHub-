/**
 * Demo data for local development and the live demo. Everything is created through the
 * real services (not raw inserts), so counters, reputation and the ledger stay consistent.
 *
 *   npm run seed -w @devhub/api   (idempotent: skips if the demo users already exist)
 *
 * Every demo account uses the password "password123".
 */
import { loadEnv } from './config/env.js';
import { createContainer } from './container.js';
import type { AuthUser } from './middleware/auth.js';

const PASSWORD = 'password123';

const USERS = [
  {
    username: 'ada',
    displayName: 'Ada Lovelace',
    bio: 'Analytical engines, algorithms and TypeScript.',
  },
  {
    username: 'grace',
    displayName: 'Grace Hopper',
    bio: 'Compilers, debugging and distributed systems.',
  },
  { username: 'linus', displayName: 'Linus T.', bio: 'Kernels, Git internals and performance.' },
  {
    username: 'margaret',
    displayName: 'Margaret H.',
    bio: 'Reliability engineering and real-time systems.',
  },
  { username: 'alan', displayName: 'Alan T.', bio: 'Computability, crypto and Python.' },
  {
    username: 'barbara',
    displayName: 'Barbara L.',
    bio: 'Abstraction, data types and API design.',
  },
];

const QUESTIONS: {
  by: string;
  title: string;
  body: string;
  tags: string[];
  answers: { by: string; body: string; votes: string[] }[];
  accept?: number;
  votes: string[];
}[] = [
  {
    by: 'ada',
    title: 'How do I debounce a value inside a custom React hook?',
    body: 'I have a search box that calls an API on every keystroke. I want a `useDebounce(value, delay)` hook that avoids stale closures and cleans up properly on unmount.\n\n```tsx\nconst results = useSearch(query); // fires on every key\n```',
    tags: ['react', 'hooks', 'typescript'],
    votes: ['grace', 'linus', 'alan'],
    answers: [
      {
        by: 'grace',
        body: 'Keep the timer in an effect and clear it in the cleanup:\n\n```tsx\nexport function useDebounce<T>(value: T, delay = 300): T {\n  const [debounced, setDebounced] = useState(value);\n  useEffect(() => {\n    const id = setTimeout(() => setDebounced(value), delay);\n    return () => clearTimeout(id);\n  }, [value, delay]);\n  return debounced;\n}\n```\n\nThe cleanup runs before the next effect and on unmount, so there is never more than one pending timer.',
        votes: ['ada', 'linus', 'barbara'],
      },
      {
        by: 'linus',
        body: 'If you also need to cancel in-flight requests, pair it with an `AbortController` in the fetching effect.',
        votes: ['alan'],
      },
    ],
    accept: 0,
  },
  {
    by: 'linus',
    title: 'Why is my Postgres query slow even though the column is indexed?',
    body: 'Filtering `WHERE lower(email) = $1` takes 400 ms on a 2M row table. There is a B-tree index on `email`. `EXPLAIN` shows a sequential scan.',
    tags: ['postgres', 'performance', 'sql'],
    votes: ['ada', 'margaret'],
    answers: [
      {
        by: 'margaret',
        body: 'The index is on `email`, but you filter on `lower(email)`: a function of the column cannot use that index. Either create an expression index:\n\n```sql\nCREATE INDEX users_email_lower_idx ON users (lower(email));\n```\n\nor store emails lowercase and query the plain column (simpler, and what you want for uniqueness anyway).',
        votes: ['linus', 'ada', 'grace'],
      },
    ],
    accept: 0,
  },
  {
    by: 'alan',
    title: 'Optimistic vs pessimistic locking for a seat-booking API?',
    body: 'Two users can try to book the last seat at the same moment. Should I use `SELECT ... FOR UPDATE`, a version column, or a unique constraint?',
    tags: ['system-design', 'postgres', 'concurrency'],
    votes: ['grace', 'barbara', 'linus', 'ada'],
    answers: [
      {
        by: 'barbara',
        body: '- **Contention is high on one row** (the last seat): pessimistic `SELECT ... FOR UPDATE` inside a short transaction is simplest and correct.\n- **Contention is rare**: optimistic locking with a `version` column avoids holding locks; retry on conflict.\n- Either way, back it with a **constraint** (e.g. unique `(event_id, seat_no)`) so a bug cannot double-book.\n\nDevHub+ uses the row-lock approach for session capacity.',
        votes: ['alan', 'grace'],
      },
    ],
  },
  {
    by: 'margaret',
    title: 'How should I structure error handling in an Express 5 API?',
    body: 'Express 5 forwards rejected promises to the error middleware. What is a clean pattern for domain errors vs unexpected bugs?',
    tags: ['node', 'express', 'error-handling'],
    votes: ['ada'],
    answers: [
      {
        by: 'ada',
        body: 'Throw typed domain errors (`NotFoundError`, `ForbiddenError`) carrying a status and a stable code; let one error middleware map them to a uniform JSON body. Anything that is not a domain error is a bug: log it with the stack and return a generic 500 without internals.',
        votes: ['margaret', 'linus'],
      },
    ],
    accept: 0,
  },
  {
    by: 'grace',
    title: 'What is the difference between a CRDT and operational transformation?',
    body: 'Building a collaborative editor. Both Yjs and ShareDB come up. What are the trade-offs?',
    tags: ['crdt', 'realtime', 'system-design'],
    votes: ['alan', 'barbara'],
    answers: [],
  },
  {
    by: 'barbara',
    title: 'When should I reach for Redis in a Node.js backend?',
    body: 'My app is a single Express instance with Postgres. People keep telling me to add Redis. For what, exactly?',
    tags: ['redis', 'node', 'caching'],
    votes: ['linus'],
    answers: [
      {
        by: 'linus',
        body: 'Add it when you have a concrete need: shared rate limits across instances, a cache for hot reads, Socket.IO fan-out across instances, or a job queue. With one instance, an in-memory cache is fine; design the code behind an interface so you can switch later.',
        votes: ['barbara', 'ada'],
      },
    ],
    accept: 0,
  },
];

const SNIPPETS = [
  {
    by: 'ada',
    title: 'Type-safe useDebounce hook',
    language: 'typescript' as const,
    tags: ['react', 'hooks'],
    description: 'Debounce any value; cleans up on unmount.',
    code: "import { useEffect, useState } from 'react';\n\nexport function useDebounce<T>(value: T, delay = 300): T {\n  const [debounced, setDebounced] = useState(value);\n  useEffect(() => {\n    const id = setTimeout(() => setDebounced(value), delay);\n    return () => clearTimeout(id);\n  }, [value, delay]);\n  return debounced;\n}\n",
    stars: ['grace', 'linus', 'alan'],
  },
  {
    by: 'linus',
    title: 'LRU cache in O(1) with a Map',
    language: 'typescript' as const,
    tags: ['algorithms', 'caching'],
    description: 'Map preserves insertion order, so the first key is the least recently used.',
    code: 'export class LRU<K, V> {\n  private map = new Map<K, V>();\n  constructor(private capacity: number) {}\n\n  get(key: K): V | undefined {\n    if (!this.map.has(key)) return undefined;\n    const value = this.map.get(key)!;\n    this.map.delete(key);\n    this.map.set(key, value);\n    return value;\n  }\n\n  set(key: K, value: V): void {\n    this.map.delete(key);\n    this.map.set(key, value);\n    if (this.map.size > this.capacity) this.map.delete(this.map.keys().next().value!);\n  }\n}\n',
    stars: ['ada', 'barbara'],
  },
  {
    by: 'alan',
    title: 'Retry with exponential backoff and jitter',
    language: 'python' as const,
    tags: ['resilience'],
    description: 'Full jitter avoids thundering herds.',
    code: 'import random, time\n\ndef retry(fn, attempts=5, base=0.1, cap=5.0):\n    for i in range(attempts):\n        try:\n            return fn()\n        except Exception:\n            if i == attempts - 1:\n                raise\n            time.sleep(random.uniform(0, min(cap, base * 2 ** i)))\n',
    stars: ['margaret'],
  },
  {
    by: 'margaret',
    title: 'Graceful shutdown for an HTTP server',
    language: 'javascript' as const,
    tags: ['node', 'reliability'],
    description: 'Stop accepting connections, finish in-flight work, then exit.',
    code: "process.on('SIGTERM', () => {\n  server.close(async () => {\n    await db.disconnect();\n    process.exit(0);\n  });\n  setTimeout(() => process.exit(1), 10_000).unref();\n});\n",
    stars: ['linus', 'ada'],
  },
];

async function main() {
  const c = createContainer(loadEnv(), { redis: null });
  // Several API replicas may boot at once: a session-level advisory lock makes them seed one
  // at a time (the lock is released when this process disconnects).
  await c.db.$executeRawUnsafe('SELECT pg_advisory_lock(7310421)');
  const existing = await c.db.user.count({
    where: { username: { in: USERS.map((x) => x.username) } },
  });
  if (existing === USERS.length) {
    console.log('Demo data already present; nothing to do.');
    await c.db.$disconnect();
    return;
  }
  if (existing > 0) {
    throw new Error(
      'Some demo usernames already exist (partial seed or real accounts). Seed into an empty database.',
    );
  }

  const users = new Map<string, AuthUser>();
  for (const u of USERS) {
    const { user } = await c.auth.register(
      {
        username: u.username,
        email: `${u.username}@devhub.dev`,
        password: PASSWORD,
        displayName: u.displayName,
      },
      {},
      { verified: true },
    );
    await c.users.updateProfile(user.id, { bio: u.bio });
    users.set(u.username, { id: user.id, role: 'USER' });
  }
  const u = (name: string) => users.get(name)!;

  for (const q of QUESTIONS) {
    const created = await c.questions.create(u(q.by), {
      title: q.title,
      body: q.body,
      tags: q.tags,
    });
    for (const voter of q.votes) await c.questions.vote(u(voter), 'QUESTION', created.id, 1);
    const answerIds: string[] = [];
    for (const a of q.answers) {
      const ans = await c.questions.addAnswer(u(a.by), created.id, a.body);
      answerIds.push(ans.id);
      for (const voter of a.votes) await c.questions.vote(u(voter), 'ANSWER', ans.id, 1);
    }
    if (q.accept !== undefined) await c.questions.accept(u(q.by), created.id, answerIds[q.accept]!);
  }

  for (const s of SNIPPETS) {
    const created = await c.snippets.create(u(s.by), {
      title: s.title,
      description: s.description,
      code: s.code,
      language: s.language,
      tags: s.tags,
    });
    for (const fan of s.stars) await c.snippets.setStar(u(fan), created.id, true);
  }

  await c.users.replaceSkills(u('ada').id, [
    { name: 'TypeScript', rating: 9 },
    { name: 'React', rating: 8 },
    { name: 'PostgreSQL', rating: 6 },
    { name: 'System design', rating: 5 },
  ]);

  const live = await c.sessions.create(u('grace'), {
    title: 'Live: building an LRU cache together',
    description: 'Pair-program an O(1) LRU cache, then add TTL support. All levels welcome.',
    language: 'typescript',
    tags: ['algorithms'],
  });
  await c.sessions.join(u('linus'), live.id);
  await c.sessions.postMessage(
    u('grace'),
    live.id,
    'Welcome! Start by sketching the interface in the editor.',
  );
  await c.sessions.create(u('barbara'), {
    title: 'System design: rate limiter',
    description:
      'Token bucket vs sliding window, and how to make it work across instances with Redis.',
    language: 'typescript',
    tags: ['system-design'],
    scheduledFor: new Date(Date.now() + 2 * 86_400_000).toISOString(),
  });

  await new Promise((r) => setTimeout(r, 200)); // let notification handlers finish
  console.log(
    `Seeded ${USERS.length} users, ${QUESTIONS.length} questions, ${SNIPPETS.length} snippets and 2 sessions.`,
  );
  console.log(`Sign in as ada@devhub.dev / ${PASSWORD}`);
  await c.db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
