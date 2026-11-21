import { z } from 'zod';
import type { UserSummary } from './common.js';

/**
 * Interview mode: a session with a problem statement, a server-kept timer, private
 * interviewer notes and a scorecard, plus an optional AI voice interviewer for practice.
 */

export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export type RunnableProblemLanguage = 'javascript' | 'typescript' | 'python';

export interface InterviewProblem {
  slug: string;
  title: string;
  difficulty: Difficulty;
  topics: string[];
  /** Markdown. */
  statement: string;
  /** A function called with each test's arguments, or a class driven by a sequence of calls. */
  kind: 'function' | 'class';
  /** The function or class name the tests call, per language (TypeScript uses the JavaScript name). */
  entry: { javascript: string; python: string };
  starter: Record<RunnableProblemLanguage, string>;
}

/** A small built-in bank, so an interviewer can start in two clicks. */
export const INTERVIEW_PROBLEMS: readonly InterviewProblem[] = [
  {
    slug: 'two-sum',
    kind: 'function',
    entry: { javascript: 'twoSum', python: 'two_sum' },
    starter: {
      javascript: 'function twoSum(nums, target) {\n  // Return the two indices, e.g. [0, 1]\n}\n',
      typescript:
        'function twoSum(nums: number[], target: number): number[] {\n  // Return the two indices, e.g. [0, 1]\n  return [];\n}\n',
      python: 'def two_sum(nums, target):\n    # Return the two indices, e.g. [0, 1]\n    pass\n',
    },
    title: 'Two Sum',
    difficulty: 'Easy',
    topics: ['arrays', 'hash map'],
    statement: `Given an array of integers \`nums\` and an integer \`target\`, return the indices of the two numbers that add up to \`target\`.

You may assume exactly one solution exists, and you may not use the same element twice.

**Example:** \`nums = [2, 7, 11, 15]\`, \`target = 9\` → \`[0, 1]\`

**Follow-up:** can you do better than O(n²)?`,
  },
  {
    slug: 'valid-parentheses',
    kind: 'function',
    entry: { javascript: 'isValid', python: 'is_valid' },
    starter: {
      javascript: 'function isValid(s) {\n  // Return true or false\n}\n',
      typescript: 'function isValid(s: string): boolean {\n  return false;\n}\n',
      python: 'def is_valid(s):\n    # Return True or False\n    pass\n',
    },
    title: 'Valid Parentheses',
    difficulty: 'Easy',
    topics: ['stack', 'strings'],
    statement: `Given a string containing only \`()[]{}\`, decide whether it is valid: every opening bracket is closed by the same type, in the correct order.

**Examples:** \`"()[]{}"\` → true, \`"(]"\` → false, \`"([)]"\` → false, \`"{[]}"\` → true`,
  },
  {
    slug: 'merge-intervals',
    kind: 'function',
    entry: { javascript: 'merge', python: 'merge' },
    starter: {
      javascript:
        'function merge(intervals) {\n  // Return the merged intervals, sorted by start\n}\n',
      typescript: 'function merge(intervals: number[][]): number[][] {\n  return [];\n}\n',
      python:
        'def merge(intervals):\n    # Return the merged intervals, sorted by start\n    pass\n',
    },
    title: 'Merge Intervals',
    difficulty: 'Medium',
    topics: ['sorting', 'arrays'],
    statement: `Given a list of intervals \`[start, end]\`, merge all overlapping intervals and return the result sorted by start.

**Example:** \`[[1,3],[2,6],[8,10],[15,18]]\` → \`[[1,6],[8,10],[15,18]]\`

Discuss the complexity, and what changes if the intervals arrive as a stream.`,
  },
  {
    slug: 'lru-cache',
    kind: 'class',
    entry: { javascript: 'LRUCache', python: 'LRUCache' },
    starter: {
      javascript:
        'class LRUCache {\n  constructor(capacity) {}\n\n  get(key) {\n    return -1;\n  }\n\n  put(key, value) {}\n}\n',
      typescript:
        'class LRUCache {\n  constructor(capacity: number) {}\n\n  get(key: number): number {\n    return -1;\n  }\n\n  put(key: number, value: number): void {}\n}\n',
      python:
        'class LRUCache:\n    def __init__(self, capacity):\n        pass\n\n    def get(self, key):\n        return -1\n\n    def put(self, key, value):\n        pass\n',
    },
    title: 'LRU Cache',
    difficulty: 'Medium',
    topics: ['design', 'hash map', 'linked list'],
    statement: `Design a cache with a fixed capacity that evicts the **least recently used** key when full.

Implement \`get(key)\` (returns the value or -1) and \`put(key, value)\`. Both must run in **O(1)** average time.

**Follow-up:** how would you make it safe for concurrent access?`,
  },
  {
    slug: 'rate-limiter',
    kind: 'class',
    entry: { javascript: 'RateLimiter', python: 'RateLimiter' },
    starter: {
      javascript:
        'class RateLimiter {\n  constructor(limit, windowSeconds) {}\n\n  allow(userId, now) {\n    // now is in seconds; return true or false\n  }\n}\n',
      typescript:
        'class RateLimiter {\n  constructor(limit: number, windowSeconds: number) {}\n\n  allow(userId: string, now: number): boolean {\n    return false;\n  }\n}\n',
      python:
        'class RateLimiter:\n    def __init__(self, limit, window_seconds):\n        pass\n\n    def allow(self, user_id, now):\n        # now is in seconds; return True or False\n        pass\n',
    },
    title: 'Rate Limiter',
    difficulty: 'Medium',
    topics: ['design', 'queues', 'time'],
    statement: `Implement a \`RateLimiter(limit, windowSeconds)\` class with \`allow(userId, now)\`, which permits at most **limit requests per user in any sliding window of windowSeconds**. A request at time \`now\` (seconds) is allowed if fewer than \`limit\` requests by that user were *allowed* in \`(now - windowSeconds, now]\`; rejected requests don't count.

Start with a single process, then discuss how you would enforce it across many API servers (for example with Redis), and the trade-offs between a fixed window, a sliding log and a token bucket.`,
  },
  {
    slug: 'top-k-frequent',
    kind: 'function',
    entry: { javascript: 'topKFrequent', python: 'top_k_frequent' },
    starter: {
      javascript:
        'function topKFrequent(words, k) {\n  // Most frequent first; ties alphabetical\n}\n',
      typescript:
        'function topKFrequent(words: string[], k: number): string[] {\n  return [];\n}\n',
      python:
        'def top_k_frequent(words, k):\n    # Most frequent first; ties alphabetical\n    pass\n',
    },
    title: 'Top K Frequent Words',
    difficulty: 'Hard',
    topics: ['heap', 'hash map', 'streaming'],
    statement: `Given a list of words and an integer \`k\`, return the \`k\` most frequent words, ordered by frequency (ties broken alphabetically).

**Follow-ups:** do it in O(n log k); then assume the words arrive as an unbounded stream that does not fit in memory.`,
  },
];

export const findProblem = (slug: string) => INTERVIEW_PROBLEMS.find((p) => p.slug === slug);

// ---------------------------------------------------------------- proctoring

export const PROCTORING_EVENT_TYPES = [
  'TAB_SWITCH',
  'FULLSCREEN_EXIT',
  'COPY_PASTE',
  'FOCUS_LOST',
  'SCREEN_SHARE_STOPPED',
] as const;
export type ProctoringEventType = (typeof PROCTORING_EVENT_TYPES)[number];

export const proctoringEventSchema = z.object({
  type: z.enum(PROCTORING_EVENT_TYPES),
  detail: z.string().max(500).default(''),
});
export type ProctoringEventInput = z.infer<typeof proctoringEventSchema>;

export interface ProctoringEventDto {
  id: string;
  sessionId: string;
  userId: string;
  username: string;
  type: ProctoringEventType;
  detail: string;
  createdAt: string;
}

export interface ProctoringConfigDto {
  enabled: boolean;
  requireCamera: boolean;
  requireScreenShare: boolean;
  enforceFullscreen: boolean;
  blockCopyPaste: boolean;
}

export const proctoringConfigSchema = z.object({
  enabled: z.boolean().default(false),
  requireCamera: z.boolean().default(false),
  requireScreenShare: z.boolean().default(false),
  enforceFullscreen: z.boolean().default(true),
  blockCopyPaste: z.boolean().default(true),
});

export interface ProctoringStatusDto {
  events: ProctoringEventDto[];
  violations: number;
  config: ProctoringConfigDto;
}

export const interviewSetupSchema = z
  .object({
    /** A problem from the bank… */
    problemSlug: z.string().max(60).optional(),
    /** …or the interviewer's own. */
    customProblem: z
      .object({
        title: z.string().trim().min(3).max(120),
        statement: z.string().trim().min(10).max(8_000),
      })
      .optional(),
    durationMinutes: z.coerce.number().int().min(10).max(120).default(45),
    proctoring: proctoringConfigSchema.optional(),
  })
  .refine((v) => Boolean(v.problemSlug) !== Boolean(v.customProblem), {
    message: 'Pick a problem from the bank or write your own',
    path: ['problemSlug'],
  })
  .refine((v) => !v.problemSlug || findProblem(v.problemSlug), {
    message: 'Unknown problem',
    path: ['problemSlug'],
  });
export type InterviewSetupInput = z.input<typeof interviewSetupSchema>;

export const interviewControlSchema = z.discriminatedUnion('action', [
  /** Reveal the problem to the candidate and start the clock. */
  z.object({ action: z.literal('start') }),
  z.object({ action: z.literal('extend'), minutes: z.coerce.number().int().min(1).max(30) }),
  z.object({ action: z.literal('end') }),
]);
export type InterviewControlInput = z.infer<typeof interviewControlSchema>;

/** What every participant sees. Notes and the scorecard are never part of it. */
export interface InterviewStateDto {
  sessionId: string;
  /** Null for the candidate until the interviewer starts the clock. */
  problem: {
    title: string;
    statement: string;
    difficulty: Difficulty | null;
    /** Bank problems only (null for a custom problem). */
    slug: string | null;
    /** Whether solutions can be checked against tests. */
    hasTests: boolean;
  } | null;
  problemHidden: boolean;
  durationMinutes: number;
  startedAt: string | null;
  endsAt: string | null;
  endedAt: string | null;
  /** Server clock when this was produced, so clients can correct for skew. */
  serverNow: string;
  /** Proctoring settings for the interview, if enabled. */
  proctoring: ProctoringConfigDto | null;
}

export const RATING_KEYS = ['problemSolving', 'codeQuality', 'communication', 'testing'] as const;
export type RatingKey = (typeof RATING_KEYS)[number];
export const RATING_LABELS: Record<RatingKey, string> = {
  problemSolving: 'Problem solving',
  codeQuality: 'Code quality',
  communication: 'Communication',
  testing: 'Testing and edge cases',
};

export const RECOMMENDATIONS = ['STRONG_NO', 'NO', 'YES', 'STRONG_YES'] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];

/** Private to the interviewer who wrote it. */
export const scorecardSchema = z.object({
  notes: z.string().max(20_000).default(''),
  ratings: z
    .object(
      Object.fromEntries(
        RATING_KEYS.map((k) => [k, z.number().int().min(1).max(4).optional()]),
      ) as Record<RatingKey, z.ZodOptional<z.ZodNumber>>,
    )
    .partial()
    .default({}),
  recommendation: z.enum(RECOMMENDATIONS).nullable().default(null),
});
export type ScorecardInput = z.input<typeof scorecardSchema>;

export interface ScorecardDto {
  notes: string;
  ratings: Partial<Record<RatingKey, number>>;
  recommendation: Recommendation | null;
  updatedAt: string | null;
}

/** Short-lived credential for the browser to talk to the Gemini Live API directly. */
export interface VoiceTokenDto {
  token: string;
  model: string;
  /** The session must be opened before this (about a minute). */
  connectBy: string;
  /** The conversation is cut off after this. */
  expiresAt: string;
}

export const transcriptEntrySchema = z.object({
  role: z.enum(['interviewer', 'candidate']),
  text: z.string().trim().min(1).max(4_000),
});
export type TranscriptEntry = z.infer<typeof transcriptEntrySchema>;

export const interviewFeedbackRequestSchema = z.object({
  transcript: z.array(transcriptEntrySchema).min(2).max(600),
  /** The candidate's code at the end (the client holds the live document). */
  code: z.string().max(64_000).default(''),
});
export type InterviewFeedbackRequest = z.input<typeof interviewFeedbackRequestSchema>;

/** What the model must return; validated before it is stored. */
export const aiInterviewFeedbackSchema = z.object({
  scores: z.object(
    Object.fromEntries(RATING_KEYS.map((k) => [k, z.number().int().min(1).max(4)])) as Record<
      RatingKey,
      z.ZodNumber
    >,
  ),
  strengths: z.array(z.string().max(400)).max(5),
  improvements: z.array(z.string().max(400)).max(5),
  summary: z.string().max(1_500),
  recommendation: z.enum(RECOMMENDATIONS),
});
export type AiInterviewFeedback = z.infer<typeof aiInterviewFeedbackSchema>;

export interface InterviewFeedbackDto extends AiInterviewFeedback {
  id: string;
  sessionId: string;
  model: string;
  isDemo: boolean;
  turns: number;
  createdAt: string;
}

export const submitSolutionSchema = z.object({
  language: z.enum(['javascript', 'typescript', 'python']),
  code: z.string().min(1).max(64_000),
});
export type SubmitSolutionInput = z.infer<typeof submitSolutionSchema>;

export interface TestCaseResultDto {
  index: number;
  hidden: boolean;
  passed: boolean;
  /** Visible tests only: what was called, what was expected and what came back. */
  input?: string;
  expected?: string;
  actual?: string;
  /** An exception thrown by the solution for this test (shown for hidden tests too). */
  error?: string;
}

export type SubmissionStatus = 'passed' | 'failed' | 'error' | 'timeout';

/** A solution checked against the problem's tests, shared live with the room. */
export interface SubmissionDto {
  id: string;
  sessionId: string;
  user: UserSummary;
  problemSlug: string;
  language: RunnableProblemLanguage;
  status: SubmissionStatus;
  passed: number;
  total: number;
  cases: TestCaseResultDto[];
  /** Whatever the solution printed, and any error output (truncated). */
  stdout: string;
  stderr: string;
  durationMs: number;
  createdAt: string;
}

export interface InterviewHistoryItemDto {
  sessionId: string;
  title: string;
  problemTitle: string | null;
  difficulty: Difficulty | null;
  /** practice = you hosted it alone (for example with the AI interviewer). */
  role: 'interviewer' | 'candidate' | 'practice';
  status: 'SCHEDULED' | 'LIVE' | 'ENDED';
  createdAt: string;
  startedAt: string | null;
  durationMinutes: number;
  /** Your best test run in this interview. */
  bestSubmission: { passed: number; total: number } | null;
  /** Your latest AI feedback here: the average of the four scores (1-4). */
  feedback: { average: number; recommendation: Recommendation; createdAt: string } | null;
  /** Hosts only: your own private recommendation from the scorecard. */
  myRecommendation: Recommendation | null;
}

export interface InterviewHistoryDto {
  items: InterviewHistoryItemDto[];
  stats: {
    interviews: number;
    asCandidate: number;
    asInterviewer: number;
    practice: number;
    /** Average AI feedback score (1-4) across interviews that have feedback. */
    averageScore: number | null;
    /** Share of test runs (best per interview) that passed every test. */
    solvedRate: number | null;
  };
}
