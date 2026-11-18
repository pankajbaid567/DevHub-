import { z } from 'zod';
import type { UserSummary } from './common.js';

export type NotificationType =
  'ANSWER_POSTED' | 'ANSWER_ACCEPTED' | 'CONTENT_UPVOTED' | 'SNIPPET_STARRED' | 'SESSION_STARTED';

export interface NotificationDto {
  id: string;
  type: NotificationType;
  actor: UserSummary | null;
  /** Human-readable one-liner, rendered by the server so every client says the same thing. */
  message: string;
  /** In-app path to open, e.g. /questions/abc#answer-xyz. */
  link: string;
  readAt: string | null;
  createdAt: string;
}

export const markReadSchema = z.union([
  z.object({ ids: z.array(z.string().min(1)).min(1).max(100) }),
  z.object({ all: z.literal(true) }),
]);
