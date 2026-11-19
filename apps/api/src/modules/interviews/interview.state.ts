import { findProblem, type InterviewStateDto } from '@devhub/shared';
import { hasTests } from './problem-tests.js';

/** The interview columns of a session row. */
export interface InterviewColumns {
  id: string;
  mode: 'PAIRING' | 'INTERVIEW';
  problemSlug: string | null;
  problemTitle: string | null;
  problemStatement: string | null;
  durationMinutes: number | null;
  interviewStartedAt: Date | null;
  interviewEndsAt: Date | null;
  interviewEndedAt: Date | null;
}

export const interviewSelect = {
  id: true,
  mode: true,
  problemSlug: true,
  problemTitle: true,
  problemStatement: true,
  durationMinutes: true,
  interviewStartedAt: true,
  interviewEndsAt: true,
  interviewEndedAt: true,
} as const;

/**
 * The public interview state. The problem stays hidden from candidates until the
 * interviewer starts the clock, so nobody can read ahead; the interviewer always sees it.
 */
export function interviewState(
  s: InterviewColumns,
  viewerIsInterviewer: boolean,
): InterviewStateDto | null {
  if (s.mode !== 'INTERVIEW') return null;
  const revealed = viewerIsInterviewer || s.interviewStartedAt !== null;
  return {
    sessionId: s.id,
    problem:
      revealed && s.problemTitle
        ? {
            title: s.problemTitle,
            statement: s.problemStatement ?? '',
            difficulty: (s.problemSlug && findProblem(s.problemSlug)?.difficulty) || null,
            slug: s.problemSlug,
            hasTests: hasTests(s.problemSlug),
          }
        : null,
    problemHidden: !revealed,
    durationMinutes: s.durationMinutes ?? 45,
    startedAt: s.interviewStartedAt?.toISOString() ?? null,
    endsAt: s.interviewEndsAt?.toISOString() ?? null,
    endedAt: s.interviewEndedAt?.toISOString() ?? null,
    serverNow: new Date().toISOString(),
  };
}
