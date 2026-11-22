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

// ---------------------------------------------------------------- Problem progress & public profile

export type ProblemStatusType = 'ATTEMPTED' | 'SOLVED';

export interface ProblemProgressDto {
  problemSlug: string;
  status: ProblemStatusType;
  attempts: number;
  bestPassed: number;
  bestTotal: number;
  language: string | null;
  solvedAt: string | null;
}

export interface ProblemBookmarkDto {
  problemSlug: string;
  createdAt: string;
}

export interface ProblemNoteDto {
  problemSlug: string;
  content: string;
}

export const updateProblemNoteSchema = z.object({
  content: z.string().max(10_000),
});

// ---------------------------------------------------------------- CP platform profiles

export const CP_PLATFORMS = ['leetcode', 'codeforces', 'codechef', 'gfg', 'hackerrank'] as const;
export type CpPlatform = (typeof CP_PLATFORMS)[number];

export const CP_PLATFORM_LABELS: Record<CpPlatform, string> = {
  leetcode: 'LeetCode',
  codeforces: 'Codeforces',
  codechef: 'CodeChef',
  gfg: 'GeeksforGeeks',
  hackerrank: 'HackerRank',
};

export const CP_PLATFORM_URLS: Record<CpPlatform, string> = {
  leetcode: 'https://leetcode.com/u/',
  codeforces: 'https://codeforces.com/profile/',
  codechef: 'https://www.codechef.com/users/',
  gfg: 'https://www.geeksforgeeks.org/user/',
  hackerrank: 'https://www.hackerrank.com/profile/',
};

export interface CpProfileDto {
  platform: CpPlatform;
  username: string;
  profileUrl: string;
  stats: Record<string, unknown> | null;
  syncedAt: string | null;
}

export const upsertCpProfileSchema = z.object({
  platform: z.enum(CP_PLATFORMS),
  username: z.string().trim().min(1).max(60),
});

export const removeCpProfileSchema = z.object({
  platform: z.enum(CP_PLATFORMS),
});

// ---------------------------------------------------------------- Badges

export const BADGE_DEFINITIONS: Record<string, { label: string; description: string; icon: string }> = {
  'first-solve': { label: 'First Blood', description: 'Solved your first problem', icon: '🎯' },
  'streak-7': { label: '7-Day Streak', description: 'Solved problems 7 days in a row', icon: '🔥' },
  'streak-30': { label: '30-Day Streak', description: 'Solved problems 30 days in a row', icon: '💎' },
  'easy-10': { label: 'Warm-Up King', description: 'Solved 10 Easy problems', icon: '🌱' },
  'medium-10': { label: 'Rising Star', description: 'Solved 10 Medium problems', icon: '⭐' },
  'hard-5': { label: 'Hard Hitter', description: 'Solved 5 Hard problems', icon: '💪' },
  'dp-warrior': { label: 'DP Warrior', description: 'Solved 5 Dynamic Programming problems', icon: '🧠' },
  'tree-master': { label: 'Tree Master', description: 'Solved 5 Tree/Graph problems', icon: '🌳' },
  'array-ninja': { label: 'Array Ninja', description: 'Solved 5 Array problems', icon: '⚔️' },
  'design-guru': { label: 'Design Guru', description: 'Completed 3 System Design problems', icon: '🏗️' },
  'interview-ace': { label: 'Interview Ace', description: 'Scored 3+ in 5 practice interviews', icon: '🎖️' },
  'polyglot': { label: 'Polyglot', description: 'Solved problems in 3+ languages', icon: '🌐' },
  'all-topics': { label: 'Full Stack DSA', description: 'Solved at least one problem in every topic', icon: '🏆' },
};

export interface UserBadgeDto {
  badge: string;
  label: string;
  description: string;
  icon: string;
  earnedAt: string;
}

// ---------------------------------------------------------------- Public profile (extended)

export interface PublicProfileDto extends ProfileDto {
  problemStats: {
    total: number;
    solved: number;
    attempted: number;
    easySolved: number;
    mediumSolved: number;
    hardSolved: number;
    streak: number;
    maxStreak: number;
    topicBreakdown: { topic: string; solved: number; total: number }[];
  };
  badges: UserBadgeDto[];
  cpProfiles: CpProfileDto[];
  interviewStats: {
    totalInterviews: number;
    averageScore: number | null;
    solvedRate: number | null;
  };
  recentSolves: { problemSlug: string; problemTitle: string; difficulty: string; solvedAt: string }[];
}

// ---------------------------------------------------------------- Whiteboard

export const createWhiteboardSchema = z.object({
  title: z.string().trim().min(1).max(200).default('Untitled'),
  data: z.record(z.string(), z.unknown()),
  sessionId: z.string().optional(),
});

export const updateWhiteboardSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export interface WhiteboardDto {
  id: string;
  title: string;
  data: Record<string, unknown>;
  sessionId: string | null;
  createdAt: string;
  updatedAt: string;
}
