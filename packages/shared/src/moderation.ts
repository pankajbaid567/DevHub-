import { z } from 'zod';
import type { UserSummary } from './common.js';

export const REPORT_TARGETS = ['QUESTION', 'ANSWER', 'SNIPPET'] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

export const REPORT_REASONS = ['SPAM', 'ABUSE', 'OFF_TOPIC', 'PLAGIARISM', 'OTHER'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const createReportSchema = z.object({
  targetType: z.enum(REPORT_TARGETS),
  targetId: z.string().min(1).max(40),
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(500).optional(),
});
export type CreateReportInput = z.infer<typeof createReportSchema>;

export const resolveReportsSchema = z.object({
  targetType: z.enum(REPORT_TARGETS),
  targetId: z.string().min(1).max(40),
  action: z.enum(['dismiss', 'remove']),
  note: z.string().trim().max(500).optional(),
});
export type ResolveReportsInput = z.infer<typeof resolveReportsSchema>;

/** Structured verdict from the AI triage job (validated before it is stored). */
export const moderationTriageSchema = z.object({
  verdict: z.enum(['likely_violation', 'unclear', 'likely_ok']),
  category: z.enum(['spam', 'abuse', 'off_topic', 'plagiarism', 'none']),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(300),
});
export type ModerationTriage = z.infer<typeof moderationTriageSchema>;

/** One reported piece of content in the admin queue, with all its open reports. */
export interface ModerationItemDto {
  targetType: ReportTarget;
  targetId: string;
  /** Link to the content in the app. */
  link: string;
  title: string;
  excerpt: string;
  author: UserSummary | null;
  reportCount: number;
  reasons: ReportReason[];
  details: string[];
  firstReportedAt: string;
  triage: (ModerationTriage & { model: string }) | null;
}
