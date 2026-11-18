import { z } from 'zod';
import { pageQuerySchema, tagSchema, tagsSchema, type UserSummary } from './common.js';
import type { VoteValue } from './reputation.js';

export const QUESTION_SORTS = ['newest', 'votes', 'active', 'unanswered'] as const;

export const listQuestionsQuerySchema = pageQuerySchema.extend({
  q: z.string().trim().max(200).optional(),
  tag: tagSchema.optional(),
  sort: z.enum(QUESTION_SORTS).default('newest'),
  author: z.string().trim().max(24).optional(),
});
export type ListQuestionsQuery = z.infer<typeof listQuestionsQuerySchema>;

export const createQuestionSchema = z.object({
  title: z.string().trim().min(10, 'Title needs at least 10 characters').max(150),
  body: z.string().trim().min(20, 'Describe the problem in at least 20 characters').max(30_000),
  tags: tagsSchema.refine((t) => t.length >= 1, 'Add at least one tag'),
});
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;

export const updateQuestionSchema = createQuestionSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;

export const answerBodySchema = z.object({
  body: z.string().trim().min(10, 'Answer needs at least 10 characters').max(30_000),
});
export type AnswerInput = z.infer<typeof answerBodySchema>;

/** 1 = upvote, -1 = downvote, 0 = retract an existing vote. Voting is idempotent. */
export const voteSchema = z.object({
  value: z.union([z.literal(1), z.literal(-1), z.literal(0)]),
});
export type VoteInput = z.infer<typeof voteSchema>;

export const acceptAnswerSchema = z.object({
  answerId: z.string().min(1).nullable(),
});

export interface AnswerDto {
  id: string;
  body: string;
  score: number;
  isAccepted: boolean;
  author: UserSummary;
  myVote: VoteValue;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionSummaryDto {
  id: string;
  title: string;
  excerpt: string;
  tags: string[];
  score: number;
  answerCount: number;
  viewCount: number;
  hasAcceptedAnswer: boolean;
  author: UserSummary;
  createdAt: string;
  lastActivityAt: string;
}

export interface QuestionDetailDto extends Omit<QuestionSummaryDto, 'excerpt'> {
  body: string;
  acceptedAnswerId: string | null;
  myVote: VoteValue;
  answers: AnswerDto[];
  updatedAt: string;
}

export interface VoteResultDto {
  score: number;
  myVote: VoteValue;
}

export interface TagDto {
  name: string;
  questionCount: number;
  snippetCount: number;
}
