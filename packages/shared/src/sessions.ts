import { z } from 'zod';
import { languageSchema, pageQuerySchema, tagsSchema, type UserSummary } from './common.js';
import { interviewSetupSchema, type InterviewStateDto } from './interview.js';

export const SESSION_STATUSES = ['SCHEDULED', 'LIVE', 'ENDED'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];
export type SessionVisibility = 'PUBLIC' | 'PRIVATE';
export type ParticipantRole = 'HOST' | 'EDITOR' | 'VIEWER';
export type SessionMode = 'PAIRING' | 'INTERVIEW';

export const listSessionsQuerySchema = pageQuerySchema.extend({
  status: z.enum(SESSION_STATUSES).optional(),
  scope: z.enum(['public', 'mine']).default('public'),
});
export type ListSessionsQuery = z.infer<typeof listSessionsQuerySchema>;

export const createSessionSchema = z
  .object({
    title: z.string().trim().min(3).max(100),
    description: z.string().trim().max(2_000).default(''),
    language: languageSchema.default('javascript'),
    visibility: z.enum(['PUBLIC', 'PRIVATE']).default('PUBLIC'),
    maxParticipants: z.coerce.number().int().min(2).max(50).default(10),
    tags: tagsSchema.default([]),
    /** ISO date-time; omit to start immediately. */
    scheduledFor: z.iso.datetime({ offset: true }).optional(),
    /** Present for an interview: the host is the interviewer. */
    interview: interviewSetupSchema.optional(),
  })
  .refine((v) => !v.scheduledFor || new Date(v.scheduledFor).getTime() > Date.now() - 60_000, {
    message: 'Scheduled time must be in the future',
    path: ['scheduledFor'],
  });
export type CreateSessionInput = z.input<typeof createSessionSchema>;

export const joinSessionSchema = z.object({
  inviteCode: z.string().trim().max(32).optional(),
});

export const sendMessageSchema = z.object({
  content: z.string().trim().min(1).max(2_000),
});

export interface SessionParticipantDto {
  user: UserSummary;
  role: ParticipantRole;
  joinedAt: string;
}

export interface SessionDto {
  id: string;
  title: string;
  description: string;
  language: string;
  mode: SessionMode;
  status: SessionStatus;
  visibility: SessionVisibility;
  maxParticipants: number;
  participantCount: number;
  tags: string[];
  host: UserSummary;
  scheduledFor: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  /** Only present for the host of a private session. */
  inviteCode?: string;
  /** The caller's role, or null if they have not joined. */
  myRole: ParticipantRole | null;
}

export interface SessionDetailDto extends SessionDto {
  participants: SessionParticipantDto[];
  /** Last saved plain-text snapshot of the shared editor. */
  code: string;
  /** Interview sessions only. */
  interview: InterviewStateDto | null;
}

export interface ChatMessageDto {
  id: string;
  sessionId: string;
  content: string;
  author: UserSummary;
  createdAt: string;
}

/** Languages the sandboxed runner can execute. */
export const RUNNABLE_LANGUAGES = ['javascript', 'typescript', 'python'] as const;
export type RunnableLanguage = (typeof RUNNABLE_LANGUAGES)[number];

export const runCodeSchema = z.object({
  language: z.enum(RUNNABLE_LANGUAGES),
  code: z.string().max(64_000),
  stdin: z.string().max(16_000).optional(),
});
export type RunCodeInput = z.infer<typeof runCodeSchema>;

export type RunStatus = 'ok' | 'error' | 'timeout' | 'output_limit' | 'failed';

/** One execution in a session, shared live with every participant. */
export interface CodeRunDto {
  id: string;
  sessionId: string;
  user: UserSummary;
  language: RunnableLanguage;
  status: RunStatus;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  createdAt: string;
}

export const replayQuerySchema = z.object({
  after: z
    .string()
    .regex(/^\d{1,19}$/)
    .default('0'),
  limit: z.coerce.number().int().min(1).max(5_000).default(2_000),
});

export interface ReplayUpdateDto {
  id: string;
  /** When the edit happened (ISO). */
  t: string;
  /** Who made it; null for the baseline snapshot. */
  userId: string | null;
  /** Yjs update, base64. */
  update: string;
}

export interface ReplayPageDto {
  items: ReplayUpdateDto[];
  nextAfter: string | null;
}
