import {
  ErrorCode,
  findProblem,
  submitSolutionSchema,
  type InterviewHistoryDto,
  type InterviewHistoryItemDto,
  type RatingKey,
  type Recommendation,
  type RunnableProblemLanguage,
  type SubmissionDto,
  type SubmissionStatus,
  type SubmitSolutionInput,
  type TestCaseResultDto,
} from '@devhub/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../../lib/prisma.js';
import type { AuthUser } from '../../middleware/auth.js';
import { AppError, NotFoundError } from '../../core/errors.js';
import { toUserSummary, userSummarySelect } from '../../core/mappers.js';
import type { RunsService } from '../runs/runs.service.js';
import type { SessionsService } from '../sessions/sessions.service.js';
import { buildHarness, parseHarnessOutput } from './harness.js';
import { describeInput, hasTests, outputsMatch, PROBLEM_SUITES } from './problem-tests.js';

/** Real-time fan-out of test results to the session room (implemented by the socket layer). */
export interface SubmissionBroadcaster {
  submission(s: SubmissionDto): void;
}

const include = { user: { select: userSummarySelect } } satisfies Prisma.InterviewSubmissionInclude;
type Row = Prisma.InterviewSubmissionGetPayload<{ include: typeof include }>;

const toDto = (r: Row): SubmissionDto => ({
  id: r.id,
  sessionId: r.sessionId,
  user: toUserSummary(r.user),
  problemSlug: r.problemSlug,
  language: r.language as RunnableProblemLanguage,
  status: r.status as SubmissionStatus,
  passed: r.passed,
  total: r.total,
  cases: r.results as unknown as TestCaseResultDto[],
  stdout: r.stdout,
  stderr: r.stderr,
  durationMs: r.durationMs,
  createdAt: r.createdAt.toISOString(),
});

const conflict = (msg: string) => new AppError(409, ErrorCode.CONFLICT, msg);
const clip = (s: string, n = 300) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Checks a solution against the problem's tests in the sandbox. The harness carries only the
 * inputs; expected values are compared here, so hidden answers never reach the sandbox or the
 * browser (hidden tests report pass/fail and any exception, not their data).
 */
export class SubmissionsService {
  constructor(
    private readonly db: Db,
    private readonly sessions: SessionsService,
    private readonly runs: RunsService,
    private readonly onSubmission?: (userId: string, slug: string, passed: number, total: number, lang: string) => void,
  ) {}

  async submit(
    user: AuthUser,
    sessionId: string,
    input: SubmitSolutionInput,
    broadcast: SubmissionBroadcaster,
  ): Promise<SubmissionDto> {
    const { language, code } = submitSolutionSchema.parse(input);
    const s = await this.db.session.findUnique({
      where: { id: sessionId },
      select: {
        mode: true,
        hostId: true,
        problemSlug: true,
        interviewStartedAt: true,
        interviewEndedAt: true,
      },
    });
    if (!s) throw new NotFoundError('Session');
    await this.sessions.requireParticipant(user, sessionId);
    if (s.mode !== 'INTERVIEW') throw conflict('This is not an interview session');
    if (!hasTests(s.problemSlug)) throw conflict('This problem has no automatic tests');
    if (language === 'cpp') throw conflict('Auto-grading is not available for C++. Use the Run button to test your code.');
    if (s.hostId !== user.id && !s.interviewStartedAt)
      throw conflict('Wait for the interviewer to start the interview');
    if (s.interviewEndedAt) throw conflict('This interview has ended');

    const problem = findProblem(s.problemSlug)!;
    const suite = PROBLEM_SUITES[s.problemSlug]!;
    const baseEntry = language === 'python' ? problem.entry.python : problem.entry.javascript;
    const entry = suite.entryOverride
      ? (language === 'python' ? suite.entryOverride.python : suite.entryOverride.javascript)
      : baseEntry;

    return this.runs.exclusive(user, sessionId, async () => {
      const harness = buildHarness(
        language,
        suite.kind,
        entry,
        suite.cases.map((c) => c.input),
        code,
        suite.preamble,
      );
      const run = await this.runs.execute({ language, code: harness.code });
      const { printed, outputs } = parseHarnessOutput(run.stdout, harness.marker);

      const cases: TestCaseResultDto[] = suite.cases.map((c, index) => {
        const out = outputs?.[index];
        const passed = Boolean(out?.ok && outputsMatch(suite.compare, out.value, c.expected));
        return {
          index,
          hidden: c.hidden,
          passed,
          ...(!c.hidden && {
            input: describeInput(suite.kind, entry, c.input),
            expected: clip(JSON.stringify(c.expected)),
            ...(out?.ok && { actual: clip(JSON.stringify(out.value ?? null)) }),
          }),
          ...(out && !out.ok && { error: clip(out.error, 200) }),
        };
      });
      const passed = cases.filter((c) => c.passed).length;
      const status: SubmissionStatus =
        run.status === 'timeout'
          ? 'timeout'
          : !outputs
            ? 'error'
            : passed === cases.length
              ? 'passed'
              : 'failed';

      const row = await this.db.interviewSubmission.create({
        data: {
          sessionId,
          userId: user.id,
          problemSlug: s.problemSlug!,
          language,
          code,
          status,
          passed,
          total: cases.length,
          results: cases as unknown as Prisma.InputJsonValue,
          stdout: clip(printed, 8_000),
          stderr: clip(run.stderr, 8_000),
          durationMs: run.durationMs,
        },
        include,
      });
      const dto = toDto(row);
      broadcast.submission(dto);
      this.onSubmission?.(user.id, s.problemSlug!, passed, cases.length, language);
      return dto;
    });
  }

  /** The room's recent submissions, newest first (shared, like code runs). */
  async list(user: AuthUser, sessionId: string): Promise<SubmissionDto[]> {
    await this.sessions.requireParticipant(user, sessionId);
    const rows = await this.db.interviewSubmission.findMany({
      where: { sessionId },
      include,
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    return rows.map(toDto);
  }

  /** Every interview you took part in, with your own results only. */
  async history(user: AuthUser): Promise<InterviewHistoryDto> {
    const parts = await this.db.sessionParticipant.findMany({
      where: { userId: user.id, session: { mode: 'INTERVIEW' } },
      select: {
        session: {
          select: {
            id: true,
            title: true,
            hostId: true,
            status: true,
            problemSlug: true,
            problemTitle: true,
            durationMinutes: true,
            createdAt: true,
            interviewStartedAt: true,
            _count: { select: { participants: true } },
          },
        },
      },
      orderBy: { session: { createdAt: 'desc' } },
      take: 100,
    });
    const ids = parts.map((p) => p.session.id);
    const [subs, feedback, cards] = await Promise.all([
      this.db.interviewSubmission.findMany({
        where: { userId: user.id, sessionId: { in: ids } },
        select: { sessionId: true, passed: true, total: true },
      }),
      this.db.interviewFeedback.findMany({
        where: { userId: user.id, sessionId: { in: ids } },
        select: { sessionId: true, feedback: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.db.interviewScorecard.findMany({
        where: { interviewerId: user.id, sessionId: { in: ids } },
        select: { sessionId: true, recommendation: true },
      }),
    ]);

    const best = new Map<string, { passed: number; total: number }>();
    for (const x of subs) {
      const b = best.get(x.sessionId);
      if (!b || x.passed / x.total > b.passed / b.total) best.set(x.sessionId, x);
    }
    const latestFeedback = new Map<string, InterviewHistoryItemDto['feedback']>();
    for (const f of feedback) {
      if (latestFeedback.has(f.sessionId)) continue; // newest first
      const fb = f.feedback as {
        scores: Record<RatingKey, number>;
        recommendation: Recommendation;
      };
      const values = Object.values(fb.scores);
      latestFeedback.set(f.sessionId, {
        average: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100,
        recommendation: fb.recommendation,
        createdAt: f.createdAt.toISOString(),
      });
    }
    const recs = new Map(cards.map((c) => [c.sessionId, c.recommendation]));

    const items: InterviewHistoryItemDto[] = parts.map(({ session: s }) => ({
      sessionId: s.id,
      title: s.title,
      problemTitle: s.problemTitle,
      difficulty: (s.problemSlug && findProblem(s.problemSlug)?.difficulty) || null,
      role:
        s.hostId !== user.id ? 'candidate' : s._count.participants > 1 ? 'interviewer' : 'practice',
      status: s.status,
      createdAt: s.createdAt.toISOString(),
      startedAt: s.interviewStartedAt?.toISOString() ?? null,
      durationMinutes: s.durationMinutes ?? 45,
      bestSubmission: best.get(s.id) ?? null,
      feedback: latestFeedback.get(s.id) ?? null,
      myRecommendation: s.hostId === user.id ? (recs.get(s.id) ?? null) : null,
    }));

    const scored = items.filter((i) => i.feedback);
    const tested = items.filter((i) => i.bestSubmission);
    return {
      items,
      stats: {
        interviews: items.length,
        asCandidate: items.filter((i) => i.role === 'candidate').length,
        asInterviewer: items.filter((i) => i.role === 'interviewer').length,
        practice: items.filter((i) => i.role === 'practice').length,
        averageScore: scored.length
          ? Math.round(
              (scored.reduce((a, i) => a + i.feedback!.average, 0) / scored.length) * 100,
            ) / 100
          : null,
        solvedRate: tested.length
          ? tested.filter((i) => i.bestSubmission!.passed === i.bestSubmission!.total).length /
            tested.length
          : null,
      },
    };
  }
}
