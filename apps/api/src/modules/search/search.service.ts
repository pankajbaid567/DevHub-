import { createHash } from 'node:crypto';
import type {
  CitationDto,
  SearchHitDto,
  SearchMatch,
  SearchResultDto,
  SimilarQuestionDto,
} from '@devhub/shared';
import type { Db } from '../../lib/prisma.js';
import { cached, type Cache } from '../../lib/cache.js';
import type { Embedder } from './embedder.js';
import { toVectorLiteral } from './indexer.js';

/** RRF constant from Cormack et al. (2009); 60 is the standard choice. */
const RRF_K = 60;

/**
 * Minimum cosine similarity to show a "possible duplicate" / related question / citation.
 * Calibrated on the seed corpus with gemini-embedding-001 (768-d, query vs document task
 * types): near-duplicates scored 0.74-0.79, related posts and paraphrases 0.66-0.74,
 * topical-but-wrong matches up to 0.61 and unrelated text ~0.50. Duplicate warnings favour
 * precision (0.70); search and RAG favour recall (results are ranked, and the model is told
 * to ignore irrelevant sources). Document-to-document scores are compressed into a
 * narrow high band (0.70-0.84 across unrelated backend topics), which is why "related"
 * embeds the title as a query rather than comparing stored vectors. The offline hashing
 * embedder scores lower: near-duplicates 0.25-0.36, unrelated 0.03-0.13.
 */
const thresholds = (model: string) =>
  model.startsWith('hash-')
    ? { duplicate: 0.22, related: 0.2, semantic: 0.18, citation: 0.15 }
    : { duplicate: 0.7, related: 0.65, semantic: 0.63, citation: 0.64 };

const excerpt = (s: string, n = 220) => {
  const flat = s
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`]/g, '')
    .replace(/\s+/g, ' ');
  return flat.length > n ? `${flat.slice(0, n - 1).trim()}…` : flat.trim();
};

interface Ranked {
  key: string;
  kind: 'question' | 'snippet';
  id: string;
}

/**
 * Reciprocal rank fusion: score(d) = Σ 1 / (k + rank_i(d)). It merges result lists whose raw
 * scores are not comparable (ts_rank vs cosine similarity) using only positions, and rewards
 * documents that both retrievers rank highly.
 */
export function rrf(lists: Ranked[][]): Map<string, { item: Ranked; score: number; in: number[] }> {
  const fused = new Map<string, { item: Ranked; score: number; in: number[] }>();
  lists.forEach((list, li) =>
    list.forEach((item, rank) => {
      const entry = fused.get(item.key) ?? { item, score: 0, in: [] };
      entry.score += 1 / (RRF_K + rank + 1);
      entry.in.push(li);
      fused.set(item.key, entry);
    }),
  );
  return fused;
}

export class SearchService {
  constructor(
    private readonly db: Db,
    private readonly embedder: Embedder,
    private readonly cache: Cache,
  ) {}

  get model(): string {
    return this.embedder.model;
  }

  /** Query embeddings are cached: typing pauses repeat the same text often. */
  private queryVector(text: string): Promise<string> {
    const key = `emb:q:${this.model}:${createHash('sha256').update(text).digest('hex').slice(0, 32)}`;
    return cached(this.cache, key, 3_600, async () => {
      const [v] = await this.embedder.embed([text], 'query');
      return toVectorLiteral(v!);
    });
  }

  /** Questions that look like the one being typed (shown before posting a duplicate). */
  similarQuestions(text: string, excludeId?: string, limit = 5): Promise<SimilarQuestionDto[]> {
    return this.nearestQuestions(text, excludeId, limit, thresholds(this.model).duplicate);
  }

  private async nearestQuestions(
    text: string,
    excludeId: string | undefined,
    limit: number,
    min: number,
  ): Promise<SimilarQuestionDto[]> {
    const vec = await this.queryVector(text);
    const rows = await this.db.$queryRaw<
      {
        id: string;
        title: string;
        score: number;
        answerCount: number;
        acceptedAnswerId: string | null;
        similarity: number;
      }[]
    >`
      SELECT q.id, q.title, q.score, q."answerCount", q."acceptedAnswerId",
             1 - (e.embedding <=> ${vec}::vector) AS similarity
      FROM content_embeddings e JOIN questions q ON q.id = e."refId"
      WHERE e.kind = 'question' AND e.model = ${this.model} AND q.id <> ${excludeId ?? ''}
      ORDER BY e.embedding <=> ${vec}::vector
      LIMIT ${limit}`;
    return rows
      .filter((r) => r.similarity >= min)
      .map((r) => ({
        id: r.id,
        title: r.title,
        score: r.score,
        answerCount: r.answerCount,
        hasAcceptedAnswer: r.acceptedAnswerId !== null,
        similarity: Math.round(r.similarity * 1000) / 1000,
      }));
  }

  /**
   * Questions related to a question. The title is embedded as a *query* and matched against
   * stored document vectors: asymmetric retrieval keeps scores on the calibrated scale (the
   * query embedding is cached, so repeat views cost no API call).
   */
  async related(questionId: string, limit = 5): Promise<SimilarQuestionDto[]> {
    const q = await this.db.question.findUnique({
      where: { id: questionId },
      select: { title: true },
    });
    if (!q) return [];
    return this.nearestQuestions(q.title, questionId, limit, thresholds(this.model).related);
  }

  /**
   * Hybrid search. Keyword search (Postgres full-text) is precise for exact terms such as
   * error messages and API names; vector search finds the same idea in different words.
   * Both run in parallel and are fused with RRF.
   */
  async hybrid(q: string, limit: number): Promise<SearchResultDto> {
    const pool = 40;
    const vec = await this.queryVector(q);
    const [kwQuestions, kwSnippets, semantic] = await Promise.all([
      this.db.$queryRaw<{ id: string }[]>`
        SELECT id FROM questions WHERE "searchVector" @@ websearch_to_tsquery('english', ${q})
        ORDER BY ts_rank_cd("searchVector", websearch_to_tsquery('english', ${q})) DESC
        LIMIT ${pool}`,
      this.db.$queryRaw<{ id: string }[]>`
        SELECT id FROM snippets
        WHERE visibility = 'PUBLIC' AND "searchVector" @@ websearch_to_tsquery('english', ${q})
        ORDER BY ts_rank_cd("searchVector", websearch_to_tsquery('english', ${q})) DESC
        LIMIT ${pool}`,
      // Answers count as hits for their question: a question whose *answer* matches is relevant.
      this.db.$queryRaw<{ kind: string; id: string; distance: number }[]>`
        SELECT kind, id, MIN(distance) AS distance FROM (
          SELECT CASE WHEN e.kind = 'snippet' THEN 'snippet' ELSE 'question' END AS kind,
                 CASE WHEN e.kind = 'snippet' THEN e."refId" ELSE e."questionId" END AS id,
                 e.embedding <=> ${vec}::vector AS distance
          FROM content_embeddings e
          WHERE e.model = ${this.model}
          ORDER BY e.embedding <=> ${vec}::vector
          LIMIT ${pool * 2}
        ) hits WHERE id IS NOT NULL
        GROUP BY kind, id ORDER BY distance LIMIT ${pool}`,
    ]);

    const min = thresholds(this.model).semantic;
    const semanticList: Ranked[] = semantic
      .filter((r) => 1 - r.distance >= min)
      .map((r) => ({
        key: `${r.kind}:${r.id}`,
        kind: r.kind as 'question' | 'snippet',
        id: r.id,
      }));
    // Interleave the two keyword lists by rank so neither kind dominates.
    const keywordList: Ranked[] = [];
    for (let i = 0; i < Math.max(kwQuestions.length, kwSnippets.length); i++) {
      if (kwQuestions[i])
        keywordList.push({
          key: `question:${kwQuestions[i]!.id}`,
          kind: 'question',
          id: kwQuestions[i]!.id,
        });
      if (kwSnippets[i])
        keywordList.push({
          key: `snippet:${kwSnippets[i]!.id}`,
          kind: 'snippet',
          id: kwSnippets[i]!.id,
        });
    }

    const fused = [...rrf([keywordList, semanticList]).values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const qIds = fused.filter((f) => f.item.kind === 'question').map((f) => f.item.id);
    const sIds = fused.filter((f) => f.item.kind === 'snippet').map((f) => f.item.id);
    const [questions, snippets] = await Promise.all([
      this.db.question.findMany({
        where: { id: { in: qIds } },
        select: { id: true, title: true, body: true, score: true },
      }),
      this.db.snippet.findMany({
        where: { id: { in: sIds }, visibility: 'PUBLIC' },
        select: { id: true, title: true, description: true, starCount: true },
      }),
    ]);
    const qMap = new Map(questions.map((x) => [x.id, x]));
    const sMap = new Map(snippets.map((x) => [x.id, x]));

    const items: SearchHitDto[] = [];
    for (const f of fused) {
      const matchedBy: SearchMatch[] = f.in.map((i) => (i === 0 ? 'keyword' : 'semantic'));
      const rank = Math.round(f.score * 10_000) / 10_000;
      if (f.item.kind === 'question') {
        const x = qMap.get(f.item.id);
        if (x)
          items.push({
            kind: 'question',
            id: x.id,
            title: x.title,
            excerpt: excerpt(x.body),
            score: x.score,
            matchedBy,
            rank,
          });
      } else {
        const x = sMap.get(f.item.id);
        if (x)
          items.push({
            kind: 'snippet',
            id: x.id,
            title: x.title,
            excerpt: excerpt(x.description),
            score: x.starCount,
            matchedBy,
            rank,
          });
      }
    }
    return { items, model: this.model };
  }

  /**
   * Retrieval for the AI mentor (RAG). Takes the nearest chunks of questions and answers,
   * keeps the best chunk per document, then re-ranks with community signals: an accepted or
   * well-voted answer beats a slightly closer but unvetted one.
   */
  async retrieve(text: string, k = 5): Promise<CitationDto[]> {
    const vec = await this.queryVector(text.slice(0, 2_000));
    const rows = await this.db.$queryRaw<
      {
        kind: string;
        refId: string;
        questionId: string;
        content: string;
        similarity: number;
        title: string;
        acceptedAnswerId: string | null;
        answerScore: number | null;
        questionScore: number;
      }[]
    >`
      SELECT e.kind, e."refId", e."questionId", e.content,
             1 - (e.embedding <=> ${vec}::vector) AS similarity,
             q.title, q."acceptedAnswerId", a.score AS "answerScore", q.score AS "questionScore"
      FROM content_embeddings e
      JOIN questions q ON q.id = e."questionId"
      LEFT JOIN answers a ON e.kind = 'answer' AND a.id = e."refId"
      WHERE e.kind IN ('question', 'answer') AND e.model = ${this.model}
      ORDER BY e.embedding <=> ${vec}::vector
      LIMIT 30`;

    const min = thresholds(this.model).citation;
    const best = new Map<string, (typeof rows)[number] & { boosted: number }>();
    for (const r of rows) {
      if (r.similarity < min) continue;
      const accepted = r.kind === 'answer' && r.acceptedAnswerId === r.refId;
      const votes = Math.max(0, r.answerScore ?? r.questionScore);
      const boosted = r.similarity + (accepted ? 0.04 : 0) + 0.01 * Math.log1p(votes);
      const prev = best.get(r.refId);
      if (!prev || boosted > prev.boosted) best.set(r.refId, { ...r, boosted });
    }
    return [...best.values()]
      .sort((a, b) => b.boosted - a.boosted)
      .slice(0, k)
      .map((r, i) => ({
        n: i + 1,
        questionId: r.questionId,
        questionTitle: r.title,
        answerId: r.kind === 'answer' ? r.refId : null,
        excerpt: r.content.replace(/^Q: .*\nA: /, '').slice(0, 900),
        accepted: r.kind === 'answer' && r.acceptedAnswerId === r.refId,
        similarity: Math.round(r.similarity * 1000) / 1000,
      }));
  }
}
