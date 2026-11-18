import { z } from 'zod';

/** Duplicate detection while a question is being written. */
export const similarQuestionsQuerySchema = z.object({
  text: z.string().trim().min(10).max(500),
  excludeId: z.string().max(40).optional(),
});

/** Hybrid (keyword + semantic) search across questions and snippets. */
export const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(200),
  limit: z.coerce.number().int().min(1).max(30).default(15),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export interface SimilarQuestionDto {
  id: string;
  title: string;
  score: number;
  answerCount: number;
  hasAcceptedAnswer: boolean;
  /** Cosine similarity in [0, 1]. */
  similarity: number;
}

export type SearchMatch = 'keyword' | 'semantic';

export interface SearchHitDto {
  kind: 'question' | 'snippet';
  id: string;
  title: string;
  excerpt: string;
  /** Votes for questions, stars for snippets. */
  score: number;
  /** Which retrievers found it; both means keyword and meaning agree. */
  matchedBy: SearchMatch[];
  /** Reciprocal-rank-fusion score used for ordering. */
  rank: number;
}

export interface SearchResultDto {
  items: SearchHitDto[];
  /** Embedding model behind the semantic half ("hash-…" means the offline fallback). */
  model: string;
}

/** A community source the AI mentor was given, shown as a numbered citation. */
export interface CitationDto {
  n: number;
  questionId: string;
  questionTitle: string;
  answerId: string | null;
  excerpt: string;
  accepted: boolean;
  similarity: number;
}
