import { z } from 'zod';
import { languageSchema, pageQuerySchema, tagsSchema, type UserSummary } from './common.js';

export const SESSION_STATUSES = ['SCHEDULED', 'LIVE', 'ENDED'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];
export type SessionVisibility = 'PUBLIC' | 'PRIVATE';
export type ParticipantRole = 'HOST' | 'EDITOR' | 'VIEWER';

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
}

export interface ChatMessageDto {
  id: string;
  sessionId: string;
  content: string;
  author: UserSummary;
  createdAt: string;
}
