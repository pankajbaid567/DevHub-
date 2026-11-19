import { z } from 'zod';

/**
 * Interview mode: a session with a problem statement, a server-kept timer, private
 * interviewer notes and a scorecard, plus an optional AI voice interviewer for practice.
 */

export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export interface InterviewProblem {
  slug: string;
  title: string;
  difficulty: Difficulty;
  topics: string[];
  /** Markdown. */
  statement: string;
}

/** A small built-in bank, so an interviewer can start in two clicks. */
export const INTERVIEW_PROBLEMS: readonly InterviewProblem[] = [
  {
    slug: 'two-sum',
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
    title: 'Valid Parentheses',
    difficulty: 'Easy',
    topics: ['stack', 'strings'],
    statement: `Given a string containing only \`()[]{}\`, decide whether it is valid: every opening bracket is closed by the same type, in the correct order.

**Examples:** \`"()[]{}"\` → true, \`"(]"\` → false, \`"([)]"\` → false, \`"{[]}"\` → true`,
  },
  {
    slug: 'merge-intervals',
    title: 'Merge Intervals',
    difficulty: 'Medium',
    topics: ['sorting', 'arrays'],
    statement: `Given a list of intervals \`[start, end]\`, merge all overlapping intervals and return the result sorted by start.

**Example:** \`[[1,3],[2,6],[8,10],[15,18]]\` → \`[[1,6],[8,10],[15,18]]\`

Discuss the complexity, and what changes if the intervals arrive as a stream.`,
  },
  {
    slug: 'lru-cache',
    title: 'LRU Cache',
    difficulty: 'Medium',
    topics: ['design', 'hash map', 'linked list'],
    statement: `Design a cache with a fixed capacity that evicts the **least recently used** key when full.

Implement \`get(key)\` (returns the value or -1) and \`put(key, value)\`. Both must run in **O(1)** average time.

**Follow-up:** how would you make it safe for concurrent access?`,
  },
  {
    slug: 'rate-limiter',
    title: 'Rate Limiter',
    difficulty: 'Medium',
    topics: ['design', 'queues', 'time'],
    statement: `Implement \`allow(userId, now)\` for a limiter that permits at most **N requests per user in any sliding window of W seconds**.

Start with a single process, then discuss how you would enforce it across many API servers (for example with Redis), and the trade-offs between a fixed window, a sliding log and a token bucket.`,
  },
  {
    slug: 'top-k-frequent',
    title: 'Top K Frequent Words',
    difficulty: 'Hard',
    topics: ['heap', 'hash map', 'streaming'],
    statement: `Given a list of words and an integer \`k\`, return the \`k\` most frequent words, ordered by frequency (ties broken alphabetically).

**Follow-ups:** do it in O(n log k); then assume the words arrive as an unbounded stream that does not fit in memory.`,
  },
];

export const findProblem = (slug: string) => INTERVIEW_PROBLEMS.find((p) => p.slug === slug);

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
  problem: { title: string; statement: string; difficulty: Difficulty | null } | null;
  problemHidden: boolean;
  durationMinutes: number;
  startedAt: string | null;
  endsAt: string | null;
  endedAt: string | null;
  /** Server clock when this was produced, so clients can correct for skew. */
  serverNow: string;
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
