import { z } from 'zod';
import { languageSchema } from './common.js';

export const MENTOR_TOPICS = [
  'general',
  'debugging',
  'code-review',
  'learning',
  'career',
  'system-design',
] as const;
export type MentorTopic = (typeof MENTOR_TOPICS)[number];

export const createConversationSchema = z.object({
  topic: z.enum(MENTOR_TOPICS).default('general'),
});

export const mentorMessageSchema = z.object({
  content: z.string().trim().min(1).max(8_000),
  code: z.string().max(20_000).optional(),
});
export type MentorMessageInput = z.infer<typeof mentorMessageSchema>;

export interface MentorMessageDto {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  model: string | null;
  createdAt: string;
}

export interface ConversationSummaryDto {
  id: string;
  topic: MentorTopic;
  title: string;
  messageCount: number;
  updatedAt: string;
}

export interface ConversationDto extends ConversationSummaryDto {
  messages: MentorMessageDto[];
}

/** Server-sent events emitted while the mentor streams a reply. */
export type MentorStreamEvent =
  | { type: 'start'; messageId: string; model: string }
  | { type: 'delta'; text: string }
  | { type: 'done'; messageId: string; title?: string }
  | { type: 'error'; code: string; message: string };

export const codeAssistSchema = z.object({
  code: z.string().min(1).max(20_000),
  language: languageSchema.optional(),
  mode: z.enum(['review', 'explain']),
});
export type CodeAssistInput = z.infer<typeof codeAssistSchema>;

export const resumeTextSchema = z.object({
  text: z.string().trim().min(200, 'Paste at least 200 characters of your resume').max(30_000),
  targetRole: z.string().trim().max(100).optional(),
});

/** Structured resume review returned by the AI (validated server-side before storing). */
export const resumeReviewResultSchema = z.object({
  overallScore: z.number().min(0).max(100),
  summary: z.string(),
  sections: z.array(
    z.object({
      name: z.string(),
      score: z.number().min(0).max(100),
      strengths: z.array(z.string()),
      improvements: z.array(z.string()),
    }),
  ),
  atsKeywords: z.object({ present: z.array(z.string()), missing: z.array(z.string()) }),
  topActions: z.array(z.string()),
});
export type ResumeReviewResult = z.infer<typeof resumeReviewResultSchema>;

export interface ResumeReviewDto {
  id: string;
  fileName: string | null;
  targetRole: string | null;
  result: ResumeReviewResult;
  model: string;
  createdAt: string;
}

export const skillAssessmentSchema = z.object({
  skills: z
    .array(
      z.object({ name: z.string().trim().min(1).max(40), rating: z.number().int().min(1).max(10) }),
    )
    .min(1)
    .max(25),
  goal: z.string().trim().max(200).optional(),
});

export const skillAssessmentResultSchema = z.object({
  level: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
  summary: z.string(),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  roadmap: z.array(
    z.object({
      phase: z.string(),
      weeks: z.number().int().min(1).max(52),
      focus: z.array(z.string()),
    }),
  ),
});
export type SkillAssessmentResult = z.infer<typeof skillAssessmentResultSchema>;

export interface AiResultEnvelope<T> {
  result: T;
  model: string;
  /** True when no AI key is configured and a deterministic demo response was used. */
  isDemo: boolean;
}
