import { z } from 'zod';
import type { UserSummary } from './common.js';

export const updateProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(50).nullable(),
    bio: z.string().trim().max(500).nullable(),
    avatarUrl: z
      .url({ protocol: /^https$/ })
      .max(500)
      .nullable(),
    emailNotifications: z.boolean(),
  })
  .partial();
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const skillsUpsertSchema = z.object({
  skills: z
    .array(
      z.object({ name: z.string().trim().min(1).max(40), rating: z.number().int().min(1).max(10) }),
    )
    .max(50),
});

export interface SkillDto {
  name: string;
  rating: number;
  updatedAt: string;
}

export interface ProfileDto extends UserSummary {
  bio: string | null;
  createdAt: string;
  stats: {
    questions: number;
    answers: number;
    acceptedAnswers: number;
    snippets: number;
    sessionsHosted: number;
  };
  topTags: { name: string; count: number }[];
  skills: SkillDto[];
}

export type ActivityItem =
  | { type: 'question'; id: string; title: string; createdAt: string }
  | { type: 'answer'; id: string; questionId: string; questionTitle: string; createdAt: string }
  | { type: 'snippet'; id: string; title: string; createdAt: string }
  | { type: 'reputation'; delta: number; reason: string; createdAt: string };

export interface DashboardDto {
  user: UserSummary;
  stats: ProfileDto['stats'] & { reputationThisWeek: number; unreadNotifications: number };
  /** Reputation per day for the last 30 days (oldest first), for the sparkline. */
  reputationHistory: { date: string; reputation: number }[];
  recentActivity: ActivityItem[];
  liveSessions: { id: string; title: string; participantCount: number }[];
  unansweredInMyTags: { id: string; title: string; tags: string[] }[];
}

export interface LeaderboardEntry extends UserSummary {
  rank: number;
  answers: number;
}
