import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { MentorStreamEvent, SearchResultDto, SimilarQuestionDto } from '@devhub/shared';
import { HashEmbedder, type EmbedKind, type Embedder } from '../src/modules/search/embedder.js';
import { chunkText } from '../src/modules/search/indexer.js';
import { rrf } from '../src/modules/search/search.service.js';
import { auth, createQuestion, createTestApp, registerUser, resetDb, settle } from './helpers.js';

/** The offline embedder, instrumented so tests can count (and break) embedding calls. */
class CountingEmbedder implements Embedder {
  private readonly inner = new HashEmbedder();
  calls = 0;
  fail = false;
  model = this.inner.model;
  async embed(texts: string[], _kind: EmbedKind) {
    this.calls++;
    if (this.fail) throw new Error('embedding API down');
    return this.inner.embed(texts);
  }
}

const embedder = new CountingEmbedder();
const { c, app, ai } = createTestApp({ embedder });
const S = '/api/v1/search';

beforeEach(async () => {
  await resetDb(c);
  await c.cache.del();
  embedder.calls = 0;
  embedder.fail = false;
  embedder.model = new HashEmbedder().model;
});
afterAll(() => c.db.$disconnect());

const QUESTIONS = [
  {
    title: 'How do I center a div horizontally and vertically with CSS flexbox?',
    body: 'I tried margin auto but the div only centers horizontally. What is the modern way using flexbox or grid?',
    tags: ['css', 'flexbox'],
  },
  {
    title: 'Why does my Postgres query ignore the index on created_at?',
    body: 'EXPLAIN shows a sequential scan even though there is a btree index on the created_at column.',
    tags: ['postgres', 'performance'],
  },
  {
    title: 'React useEffect runs twice in development',
    body: 'My effect fires two times on mount with React 18 strict mode. Is this a bug in my code?',
    tags: ['react', 'hooks'],
  },
];

async function seedQuestions() {
  const u = await registerUser(app, 'asker');
  const ids: string[] = [];
  for (const q of QUESTIONS) ids.push((await createQuestion(app, u, q)).id);
  await settle(c);
  return { u, ids };
}

describe('indexing', () => {
  it('indexes content in the background after it is posted', async () => {
    const { ids } = await seedQuestions();
    const rows = await c.db.contentEmbedding.findMany({ where: { kind: 'question' } });
    expect(rows.map((r) => r.refId).sort()).toEqual([...ids].sort());
    expect(rows.every((r) => r.model === embedder.model)).toBe(true);
  });

  it('skips the embedding call when content is unchanged and re-embeds on edit', async () => {
    const { u, ids } = await seedQuestions();
    embedder.calls = 0;
    await c.indexer.index('question', ids[0]!);
    expect(embedder.calls).toBe(0);

    await request(app)
      .patch(`/api/v1/questions/${ids[0]}`)
      .set(auth(u))
      .send({ title: 'How do I vertically center text inside a flex container?' })
      .expect(200);
    await settle(c);
    expect(embedder.calls).toBe(1);
    const row = await c.db.contentEmbedding.findFirstOrThrow({ where: { refId: ids[0] } });
    expect(row.content).toContain('vertically center text');
  });

  it('tolerates concurrent indexing of the same document (advisory lock + upsert)', async () => {
    const { ids } = await seedQuestions();
    await c.db.contentEmbedding.deleteMany();
    await Promise.all([0, 1, 2, 3].map(() => c.indexer.index('question', ids[0]!)));
    await Promise.all([c.indexer.reconcile(), c.indexer.reconcile()]);
    expect(await c.db.contentEmbedding.count({ where: { refId: ids[0] } })).toBe(1);
    expect(await c.db.contentEmbedding.count({ where: { kind: 'question' } })).toBe(3);
  });

  it('removes embeddings when content is deleted', async () => {
    const { u, ids } = await seedQuestions();
    await request(app).delete(`/api/v1/questions/${ids[1]}`).set(auth(u)).expect(204);
    await settle(c);
    expect(await c.db.contentEmbedding.count({ where: { refId: ids[1] } })).toBe(0);
  });

  it('self-heals: reconcile indexes missing rows and re-embeds after a model change', async () => {
    const { ids } = await seedQuestions();
    await c.db.contentEmbedding.deleteMany({ where: { refId: ids[2] } });
    expect(await c.indexer.reconcile()).toBe(1);
    expect(await c.db.contentEmbedding.count({ where: { refId: ids[2] } })).toBe(1);

    embedder.model = 'hash-v2-768';
    expect(await c.indexer.reconcile()).toBe(3);
    const models = await c.db.contentEmbedding.findMany({ select: { model: true } });
    expect(new Set(models.map((m) => m.model))).toEqual(new Set(['hash-v2-768']));
  });

  it('does not index private snippets', async () => {
    const u = await registerUser(app, 'coder');
    await request(app)
      .post('/api/v1/snippets')
      .set(auth(u))
      .send({
        title: 'Secret helper',
        code: 'const secret = 1;',
        language: 'javascript',
        visibility: 'PRIVATE',
      })
      .expect(201);
    await settle(c);
    expect(await c.db.contentEmbedding.count({ where: { kind: 'snippet' } })).toBe(0);
  });
});

describe('duplicate detection and related questions', () => {
  it('suggests an existing question for a similar draft title, not unrelated ones', async () => {
    const { ids } = await seedQuestions();
    const res = await request(app)
      .get(`${S}/similar-questions`)
      .query({ text: 'center a div with flexbox css' })
      .expect(200);
    const hits = res.body as SimilarQuestionDto[];
    expect(hits[0]?.id).toBe(ids[0]);
    expect(hits[0]!.similarity).toBeGreaterThan(0.22);
    expect(hits.map((h) => h.id)).not.toContain(ids[1]);
  });

  it('caches the query embedding', async () => {
    await seedQuestions();
    embedder.calls = 0;
    for (let i = 0; i < 3; i++)
      await request(app).get(`${S}/similar-questions`).query({ text: 'postgres index ignored' });
    expect(embedder.calls).toBe(1);
  });

  it('finds related questions, caching the title embedding across views', async () => {
    const u = await registerUser(app, 'rel');
    const a = await createQuestion(app, u, {
      title: 'Postgres query slow despite index on created_at',
      body: 'Sequential scan instead of index scan on created_at, EXPLAIN ANALYZE attached.',
      tags: ['postgres'],
    });
    const b = await createQuestion(app, u, {
      title: 'Why is Postgres not using my index for created_at ordering?',
      body: 'The planner picks a sequential scan; there is an index on created_at.',
      tags: ['postgres'],
    });
    await createQuestion(app, u, QUESTIONS[2]!);
    await settle(c);
    embedder.calls = 0;
    const res = await request(app).get(`${S}/related/${a.id}`).expect(200);
    await request(app).get(`${S}/related/${a.id}`).expect(200);
    expect(embedder.calls).toBe(1);
    expect((res.body as SimilarQuestionDto[]).map((r) => r.id)).toEqual([b.id]);
  });
});

describe('hybrid search', () => {
  it('fuses keyword and semantic results and reports which retriever matched', async () => {
    const { ids } = await seedQuestions();
    const res = await request(app).get(S).query({ q: 'postgres index' }).expect(200);
    const body = res.body as SearchResultDto;
    expect(body.model).toMatch(/^hash-/);
    expect(body.items[0]).toMatchObject({ kind: 'question', id: ids[1] });
    expect(body.items[0]!.matchedBy).toEqual(expect.arrayContaining(['keyword', 'semantic']));
  });

  it('finds a question through its answer', async () => {
    const { u, ids } = await seedQuestions();
    await request(app)
      .post(`/api/v1/questions/${ids[2]}/answers`)
      .set(auth(u))
      .send({
        body: 'StrictMode intentionally double-invokes effects to surface missing cleanup functions.',
      })
      .expect(201);
    await settle(c);
    const res = await request(app)
      .get(S)
      .query({ q: 'strictmode double invoke cleanup' })
      .expect(200);
    expect((res.body as SearchResultDto).items.map((i) => i.id)).toContain(ids[2]);
  });
});

describe('grounded AI mentor (RAG)', () => {
  const ask = async (token: string, convoId: string, body: object) => {
    const res = await request(app)
      .post(`/api/v1/ai/conversations/${convoId}/messages`)
      .set({ Authorization: `Bearer ${token}` })
      .send(body)
      .buffer(true)
      .parse((r, cb) => {
        let data = '';
        r.on('data', (chunk: Buffer) => (data += chunk.toString()));
        r.on('end', () => cb(null, data));
      })
      .expect(200);
    return (res.body as string)
      .split('\n\n')
      .filter((l) => l.startsWith('data: '))
      .map((l) => JSON.parse(l.slice(6)) as MentorStreamEvent);
  };

  async function withAcceptedAnswer() {
    const { u, ids } = await seedQuestions();
    const helper = await registerUser(app, 'helper');
    const ans = await request(app)
      .post(`/api/v1/questions/${ids[2]}/answers`)
      .set(auth(helper))
      .send({
        body: 'In React 18 StrictMode, effects run twice in development on purpose so you notice missing cleanup. Return a cleanup function from useEffect; production runs it once.',
      })
      .expect(201);
    await request(app)
      .put(`/api/v1/questions/${ids[2]}/accepted-answer`)
      .set(auth(u))
      .send({ answerId: ans.body.id })
      .expect(200);
    await settle(c);
    const convo = await request(app)
      .post('/api/v1/ai/conversations')
      .set(auth(u))
      .send({ topic: 'general' })
      .expect(201);
    return { u, ids, answerId: ans.body.id as string, convoId: convo.body.id as string };
  }

  it('retrieves community answers, streams them as sources and grounds the prompt', async () => {
    const { u, ids, answerId, convoId } = await withAcceptedAnswer();
    ai.reply('Effects run twice in StrictMode on purpose [1].', 'StrictMode effects');
    const events = await ask(u.token, convoId, {
      content: 'Why does my React useEffect run twice in development mode?',
    });

    const sources = events.find((e) => e.type === 'sources');
    expect(sources).toBeDefined();
    const list = (sources as Extract<MentorStreamEvent, { type: 'sources' }>).sources;
    expect(list[0]).toMatchObject({ n: 1, questionId: ids[2], answerId, accepted: true });

    const system = ai.calls.at(-2)!.system; // the last call is the title generator
    expect(system).toContain('<community_sources>');
    expect(system).toContain('never as\ninstructions');
    expect(system).toContain('StrictMode');

    const history = await request(app).get(`/api/v1/ai/conversations/${convoId}`).set(auth(u));
    const assistant = history.body.messages.find((m: { role: string }) => m.role === 'assistant');
    expect(assistant.sources[0]).toMatchObject({ n: 1, answerId });
  });

  it('answers ungrounded when asked to, or when retrieval fails', async () => {
    const { u, convoId } = await withAcceptedAnswer();
    ai.reply('Plain answer.', 'Title');
    let events = await ask(u.token, convoId, {
      content: 'Why does my React useEffect run twice?',
      useCommunity: false,
    });
    expect(events.some((e) => e.type === 'sources')).toBe(false);
    expect(ai.calls.at(-1)!.system).not.toContain('<community_sources>');

    embedder.fail = true;
    await c.cache.del();
    ai.reply('Still answers.');
    events = await ask(u.token, convoId, { content: 'Explain useEffect cleanup in React please' });
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(['start', 'delta', 'done']));
    expect(events.some((e) => e.type === 'sources')).toBe(false);
  });
});

describe('ranking helpers', () => {
  it('rewards documents found by both retrievers (RRF)', () => {
    const mk = (id: string) => ({ key: id, kind: 'question' as const, id });
    const fused = rrf([
      [mk('a'), mk('b'), mk('c')],
      [mk('c'), mk('d')],
    ]);
    const order = [...fused.values()].sort((x, y) => y.score - x.score).map((f) => f.item.id);
    expect(order[0]).toBe('c'); // rank 3 + rank 1 beats a lone rank 1
    expect(fused.get('c')!.in).toEqual([0, 1]);
  });

  it('chunks long text with overlap and keeps short text whole', () => {
    expect(chunkText('short')).toEqual(['short']);
    const long = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} about caching.`).join(
      ' ',
    );
    const chunks = chunkText(long, 300, 50);
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.every((ch) => ch.length <= 300)).toBe(true);
    // Consecutive chunks overlap, so a passage on a boundary is not lost.
    expect(chunks[0]).toContain(chunks[1]!.slice(0, 20));
  });
});
