import { z } from 'zod';
import type { Difficulty, RunnableProblemLanguage, TranscriptEntry } from './interview.js';
import type { UserSummary } from './common.js';

export type OrgRole = 'OWNER' | 'ADMIN' | 'INTERVIEWER' | 'VIEWER';

export interface OrgDto {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  createdAt: string;
  memberCount: number;
  myRole: OrgRole;
}

export interface OrgMemberDto {
  user: UserSummary;
  role: OrgRole;
  joinedAt: string;
}

export const createOrgSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'Lowercase letters, digits and hyphens'),
  logoUrl: z.string().url().max(500).nullable().default(null),
});
export type CreateOrgInput = z.infer<typeof createOrgSchema>;

export const inviteOrgMemberSchema = z.object({
  email: z.string().email().max(200),
  role: z.enum(['ADMIN', 'INTERVIEWER', 'VIEWER']).default('INTERVIEWER'),
});

// ---------------------------------------------------------------- MCQ Questions

export interface McqOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface McqQuestion {
  id: string;
  text: string;
  options: McqOption[];
  explanation?: string;
  points: number;
}

export const mcqOptionSchema = z.object({
  id: z.string().min(1).max(10),
  text: z.string().trim().min(1).max(2000),
  isCorrect: z.boolean(),
});

export const mcqQuestionSchema = z
  .object({
    id: z.string().min(1).max(40),
    text: z.string().trim().min(5).max(5000),
    options: z.array(mcqOptionSchema).min(2).max(6),
    explanation: z.string().max(2000).optional(),
    points: z.number().int().min(1).max(100).default(1),
  })
  .refine((q) => q.options.some((o) => o.isCorrect), {
    message: 'At least one option must be correct',
    path: ['options'],
  });

// ---------------------------------------------------------------- Assessment

export type AssessmentStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type AssessmentSectionType = 'CODING' | 'MCQ' | 'SYSTEM_DESIGN' | 'SUBJECTIVE';

export interface AssessmentSectionDto {
  id: string;
  type: AssessmentSectionType;
  title: string;
  description: string;
  durationMinutes: number;
  /** For CODING: problem slugs from the bank or custom problem ids */
  problemSlugs: string[];
  /** For MCQ: inline questions */
  mcqQuestions: McqQuestion[];
  /** For SYSTEM_DESIGN: problem slugs from SD bank */
  sdProblemSlugs: string[];
  order: number;
}

export const assessmentSectionSchema = z.object({
  type: z.enum(['CODING', 'MCQ', 'SYSTEM_DESIGN', 'SUBJECTIVE']),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).default(''),
  durationMinutes: z.coerce.number().int().min(5).max(180).default(30),
  problemSlugs: z.array(z.string().max(60)).max(10).default([]),
  mcqQuestions: z.array(mcqQuestionSchema).max(50).default([]),
  sdProblemSlugs: z.array(z.string().max(60)).max(5).default([]),
  order: z.coerce.number().int().min(0).default(0),
});

export const createAssessmentSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(5000).default(''),
  orgId: z.string().min(1).max(64),
  sections: z.array(assessmentSectionSchema).min(1).max(10),
  totalDurationMinutes: z.coerce.number().int().min(10).max(480).default(60),
  allowedLanguages: z
    .array(z.enum(['javascript', 'typescript', 'python', 'cpp']))
    .min(1)
    .default(['javascript', 'typescript', 'python']),
  proctoring: z
    .object({
      enabled: z.boolean().default(true),
      requireCamera: z.boolean().default(true),
      requireScreenShare: z.boolean().default(true),
      enforceFullscreen: z.boolean().default(true),
      blockCopyPaste: z.boolean().default(true),
    })
    .default({
      enabled: true,
      requireCamera: true,
      requireScreenShare: true,
      enforceFullscreen: true,
      blockCopyPaste: true,
    }),
  passingScore: z.coerce.number().int().min(0).max(100).default(60),
  instructions: z.string().max(5000).default(''),
  shuffleQuestions: z.boolean().default(false),
  showScoreToCandidate: z.boolean().default(false),
});
export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>;

export interface AssessmentDto {
  id: string;
  title: string;
  description: string;
  orgId: string;
  orgName: string;
  sections: AssessmentSectionDto[];
  totalDurationMinutes: number;
  allowedLanguages: RunnableProblemLanguage[];
  proctoring: {
    enabled: boolean;
    requireCamera: boolean;
    requireScreenShare: boolean;
    enforceFullscreen: boolean;
    blockCopyPaste: boolean;
  };
  passingScore: number;
  instructions: string;
  shuffleQuestions: boolean;
  showScoreToCandidate: boolean;
  status: AssessmentStatus;
  candidateCount: number;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------- Candidate invite

export type CandidateStatus =
  | 'INVITED'
  | 'STARTED'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'EVALUATED'
  | 'EXPIRED';

export const inviteCandidatesSchema = z.object({
  assessmentId: z.string().min(1).max(64),
  candidates: z
    .array(
      z.object({
        email: z.string().email().max(200),
        name: z.string().trim().max(100).optional(),
      }),
    )
    .min(1)
    .max(500),
  expiresInHours: z.coerce.number().int().min(1).max(720).default(72),
  message: z.string().max(2000).optional(),
});
export type InviteCandidatesInput = z.infer<typeof inviteCandidatesSchema>;

export interface CandidateInviteDto {
  id: string;
  assessmentId: string;
  assessmentTitle: string;
  email: string;
  name: string | null;
  token: string;
  status: CandidateStatus;
  startedAt: string | null;
  submittedAt: string | null;
  expiresAt: string;
  score: number | null;
  maxScore: number | null;
  percentile: number | null;
  createdAt: string;
}

// ---------------------------------------------------------------- Candidate submission / response

export interface McqResponseDto {
  questionId: string;
  selectedOptionIds: string[];
  isCorrect: boolean;
  points: number;
}

export interface CodingSolutionDto {
  problemSlug: string;
  language: RunnableProblemLanguage;
  code: string;
  testsPassed: number;
  testsTotal: number;
  status: 'passed' | 'failed' | 'error' | 'timeout' | 'not_attempted';
  durationMs: number;
}

export interface SectionResultDto {
  sectionId: string;
  sectionTitle: string;
  sectionType: AssessmentSectionType;
  score: number;
  maxScore: number;
  timeSpentMinutes: number;
  mcqResponses: McqResponseDto[];
  codingSolutions: CodingSolutionDto[];
}

// ---------------------------------------------------------------- Candidate Report

export interface CandidateReportDto {
  invite: CandidateInviteDto;
  assessment: {
    title: string;
    orgName: string;
    totalDurationMinutes: number;
    passingScore: number;
  };
  sectionResults: SectionResultDto[];
  totalScore: number;
  maxTotalScore: number;
  percentage: number;
  passed: boolean;
  timeSpentMinutes: number;
  proctoringViolations: number;
  proctoringEvents: {
    type: string;
    detail: string;
    createdAt: string;
  }[];
  codeQualityScore: number | null;
  aiFeedback: string | null;
  startedAt: string;
  submittedAt: string;
}

// ---------------------------------------------------------------- Assessment analytics

export interface AssessmentAnalyticsDto {
  assessmentId: string;
  title: string;
  totalCandidates: number;
  statusBreakdown: Record<CandidateStatus, number>;
  averageScore: number | null;
  medianScore: number | null;
  passRate: number | null;
  averageTimeMinutes: number | null;
  scoreDistribution: { range: string; count: number }[];
  topCandidates: {
    name: string | null;
    email: string;
    score: number;
    maxScore: number;
    percentage: number;
    timeMinutes: number;
  }[];
  problemWiseStats: {
    slug: string;
    title: string;
    type: AssessmentSectionType;
    attemptRate: number;
    solveRate: number;
    avgScore: number;
  }[];
}
