import { createHash, randomUUID } from 'node:crypto';
import type { Db } from '../../lib/prisma.js';
import type { Embedder } from './embedder.js';

export type IndexKind = 'question' | 'answer' | 'snippet';

export const toVectorLiteral = (v: number[]) => `[${v.map((x) => x.toFixed(6)).join(',')}]`;

const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 32);

const CHUNK = 1_200;
const OVERLAP = 200;

/**
 * Splits long text into overlapping windows, preferring paragraph/sentence boundaries, so a
 * relevant passage deep inside a long answer is still retrievable on its own.
 */
export function chunkText(text: string, size = CHUNK, overlap = OVERLAP): string[] {
  const clean = text.replace(/\r\n/g, '\n').trim();
  if (clean.length <= size) return [clean];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(clean.length, start + size);
    if (end < clean.length) {
      const window = clean.slice(start, end);
      const cut = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('. '));
      if (cut > size * 0.5) end = start + cut + 1;
    }
    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = end - overlap;
  }
  return chunks.slice(0, 20);
}

interface Doc {
  questionId: string | null;
  chunks: string[];
}

/**
 * Keeps `content_embeddings` in sync with questions, answers and snippets. Runs in the
 * background (jobs), never on the request path: a slow or failing embedding API cannot
 * slow down or fail posting a question.
 */
export class SearchIndexer {
  constructor(
    private readonly db: Db,
    private readonly embedder: Embedder,
  ) {}

  get model(): string {
    return this.embedder.model;
  }

  private async load(kind: IndexKind, id: string): Promise<Doc | null> {
    if (kind === 'question') {
      const q = await this.db.question.findUnique({
        where: { id },
        select: { title: true, body: true, tags: { select: { name: true } } },
      });
      if (!q) return null;
      const tags = q.tags.map((t) => t.name).join(', ');
      // The title carries most of the meaning; the first part of the body adds context.
      return {
        questionId: id,
        chunks: [`${q.title}\n${tags ? `Tags: ${tags}\n` : ''}${q.body.slice(0, 1_500)}`],
      };
    }
    if (kind === 'answer') {
      const a = await this.db.answer.findUnique({
        where: { id },
        select: { body: true, questionId: true, question: { select: { title: true } } },
      });
      if (!a) return null;
      // Prefixing the question title gives each chunk the context it answers.
      return {
        questionId: a.questionId,
        chunks: chunkText(a.body).map((c) => `Q: ${a.question.title}\nA: ${c}`),
      };
    }
    const s = await this.db.snippet.findUnique({
      where: { id },
      select: { title: true, description: true, code: true, language: true, visibility: true },
    });
    if (!s || s.visibility === 'PRIVATE') return null;
    return {
      questionId: null,
      chunks: [`${s.title} (${s.language})\n${s.description}\n${s.code.slice(0, 1_200)}`],
    };
  }

  /** Idempotent: unchanged content (same hash and model) is skipped without an API call. */
  async index(kind: IndexKind, id: string): Promise<void> {
    const doc = await this.load(kind, id);
    if (!doc) {
      await this.remove(kind, id);
      return;
    }
    const existing = await this.db.contentEmbedding.findMany({
      where: { kind, refId: id },
      select: { chunk: true, contentHash: true, model: true },
    });
    const hashes = doc.chunks.map(sha);
    const unchanged =
      existing.length === doc.chunks.length &&
      existing.every((e) => e.model === this.model && e.contentHash === hashes[e.chunk]);
    if (unchanged) return;

    const vectors = await this.embedder.embed(doc.chunks, 'document');
    await this.db.$transaction(async (tx) => {
      // Serialise writers of the same document (two jobs for one edit, or a reconcile sweep
      // racing an edit): a transaction-scoped advisory lock, released on commit.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${kind}:${id}`}))`;
      await tx.$executeRaw`
        DELETE FROM content_embeddings
        WHERE kind = ${kind} AND "refId" = ${id} AND chunk >= ${doc.chunks.length}`;
      for (let i = 0; i < doc.chunks.length; i++) {
        await tx.$executeRaw`
          INSERT INTO content_embeddings
            (id, kind, "refId", chunk, "questionId", content, "contentHash", model, embedding, "updatedAt")
          VALUES (${randomUUID()}, ${kind}, ${id}, ${i}, ${doc.questionId}, ${doc.chunks[i]!},
                  ${hashes[i]!}, ${this.model}, ${toVectorLiteral(vectors[i]!)}::vector, now())
          ON CONFLICT (kind, "refId", chunk) DO UPDATE SET
            "questionId" = EXCLUDED."questionId", content = EXCLUDED.content,
            "contentHash" = EXCLUDED."contentHash", model = EXCLUDED.model,
            embedding = EXCLUDED.embedding, "updatedAt" = now()`;
      }
    });
  }

  async remove(kind: IndexKind, id: string): Promise<void> {
    await this.db
      .$executeRaw`DELETE FROM content_embeddings WHERE kind = ${kind} AND "refId" = ${id}`;
  }

  /**
   * Self-healing sweep: indexes content that has no embedding from the current model (new
   * rows whose job was lost, or everything after an embedder change) and drops embeddings
   * whose content was deleted. Bounded per run so it never hogs the embedding quota.
   */
  async reconcile(batch = 100): Promise<number> {
    await this.db.$executeRaw`
      DELETE FROM content_embeddings e WHERE
        (e.kind = 'question' AND NOT EXISTS (SELECT 1 FROM questions q WHERE q.id = e."refId")) OR
        (e.kind = 'answer' AND NOT EXISTS (SELECT 1 FROM answers a WHERE a.id = e."refId")) OR
        (e.kind = 'snippet' AND NOT EXISTS
          (SELECT 1 FROM snippets s WHERE s.id = e."refId" AND s.visibility <> 'PRIVATE'))`;

    const missing = await this.db.$queryRaw<{ kind: IndexKind; id: string }[]>`
      SELECT * FROM (
        SELECT 'question' AS kind, q.id FROM questions q
        WHERE NOT EXISTS (SELECT 1 FROM content_embeddings e
          WHERE e.kind = 'question' AND e."refId" = q.id AND e.model = ${this.model})
        UNION ALL
        SELECT 'answer', a.id FROM answers a
        WHERE NOT EXISTS (SELECT 1 FROM content_embeddings e
          WHERE e.kind = 'answer' AND e."refId" = a.id AND e.model = ${this.model})
        UNION ALL
        SELECT 'snippet', s.id FROM snippets s
        WHERE s.visibility <> 'PRIVATE' AND NOT EXISTS (SELECT 1 FROM content_embeddings e
          WHERE e.kind = 'snippet' AND e."refId" = s.id AND e.model = ${this.model})
      ) t LIMIT ${batch}`;
    for (const m of missing) await this.index(m.kind, m.id);
    return missing.length;
  }
}
