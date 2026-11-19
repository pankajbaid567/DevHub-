import {
  ErrorCode,
  interviewFeedbackRequestSchema,
  scorecardSchema,
  type InterviewControlInput,
  type InterviewFeedbackDto,
  type InterviewFeedbackRequest,
  type InterviewStateDto,
  type ScorecardDto,
  type ScorecardInput,
  type TranscriptEntry,
  type VoiceTokenDto,
} from '@devhub/shared';
import type { Db } from '../../lib/prisma.js';
import type { Cache } from '../../lib/cache.js';
import type { Logger } from '../../lib/logger.js';
import type { AuthUser } from '../../middleware/auth.js';
import { AppError, ForbiddenError, NotFoundError } from '../../core/errors.js';
import type { AiService } from '../ai/ai.service.js';
import type { SessionsService } from '../sessions/sessions.service.js';
import { interviewSelect, interviewState } from './interview.state.js';
import { interviewerInstruction, type LiveTokenIssuer } from './live-token.js';

/** Real-time fan-out of interview state to the session room (implemented by the socket layer). */
export interface InterviewBroadcaster {
  interview(state: InterviewStateDto): void;
}

/** Free-tier friendly limits for the voice interviewer. */
export const VOICE_LIMITS = { perDay: 10, cooldownS: 15, maxMinutes: 30 } as const;
const FEEDBACK_COOLDOWN_S = 20;

const conflict = (msg: string) => new AppError(409, ErrorCode.CONFLICT, msg);

/**
 * Interview mode on top of a session. The host is the interviewer: only they control the
 * clock and only they can read their scorecard. The clock is kept by the server
 * (`interviewEndsAt`), so every client counts down to the same instant regardless of when
 * it joined, and transitions are conditional updates, so double clicks or two tabs can't
 * start an interview twice.
 */
export class InterviewService {
  constructor(
    private readonly db: Db,
    private readonly sessions: SessionsService,
    private readonly ai: AiService,
    private readonly live: LiveTokenIssuer,
    private readonly cache: Cache,
    private readonly logger: Logger,
  ) {}

  get voiceEnabled(): boolean {
    return this.live.enabled;
  }

  private async load(sessionId: string) {
    const s = await this.db.session.findUnique({
      where: { id: sessionId },
      select: { ...interviewSelect, hostId: true, status: true },
    });
    if (!s) throw new NotFoundError('Session');
    if (s.mode !== 'INTERVIEW') throw conflict('This is not an interview session');
    return s;
  }

  private async requireInterviewer(user: AuthUser, sessionId: string) {
    await this.sessions.requireParticipant(user, sessionId); // 404 for outsiders of private sessions
    const s = await this.load(sessionId);
    if (s.hostId !== user.id) throw new ForbiddenError('Only the interviewer can do that');
    return s;
  }

  async control(
    user: AuthUser,
    sessionId: string,
    input: InterviewControlInput,
    broadcast: InterviewBroadcaster,
  ): Promise<InterviewStateDto> {
    const s = await this.requireInterviewer(user, sessionId);
    const now = new Date();
    if (input.action === 'start') {
      if (s.status !== 'LIVE') throw conflict('Start the session first');
      const { count } = await this.db.session.updateMany({
        where: { id: sessionId, interviewStartedAt: null },
        data: {
          interviewStartedAt: now,
          interviewEndsAt: new Date(now.getTime() + (s.durationMinutes ?? 45) * 60_000),
        },
      });
      if (!count) throw conflict('The interview has already started');
    } else if (input.action === 'extend') {
      // Relative to the stored deadline, in SQL: two extensions both apply.
      const n = await this.db.$executeRaw`
        UPDATE sessions
        SET "interviewEndsAt" = "interviewEndsAt" + make_interval(mins => ${input.minutes}::int),
            "durationMinutes" = "durationMinutes" + ${input.minutes}::int
        WHERE id = ${sessionId} AND "interviewStartedAt" IS NOT NULL AND "interviewEndedAt" IS NULL`;
      if (!n) throw conflict('Only a running interview can be extended');
    } else {
      const { count } = await this.db.session.updateMany({
        where: { id: sessionId, interviewStartedAt: { not: null }, interviewEndedAt: null },
        data: { interviewEndedAt: now },
      });
      if (!count) throw conflict('The interview is not running');
    }
    const fresh = await this.db.session.findUniqueOrThrow({
      where: { id: sessionId },
      select: interviewSelect,
    });
    // After "start" the problem is public, so one payload fits everyone in the room.
    const state = interviewState(fresh, false)!;
    broadcast.interview(state);
    return interviewState(fresh, true)!;
  }

  async scorecard(user: AuthUser, sessionId: string): Promise<ScorecardDto> {
    await this.requireInterviewer(user, sessionId);
    const row = await this.db.interviewScorecard.findUnique({
      where: { sessionId_interviewerId: { sessionId, interviewerId: user.id } },
    });
    return {
      notes: row?.notes ?? '',
      ratings: (row?.ratings as ScorecardDto['ratings']) ?? {},
      recommendation: row?.recommendation ?? null,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  }

  async saveScorecard(
    user: AuthUser,
    sessionId: string,
    input: ScorecardInput,
  ): Promise<ScorecardDto> {
    await this.requireInterviewer(user, sessionId);
    const data = scorecardSchema.parse(input);
    const row = await this.db.interviewScorecard.upsert({
      where: { sessionId_interviewerId: { sessionId, interviewerId: user.id } },
      create: { sessionId, interviewerId: user.id, ...data },
      update: data,
    });
    return {
      notes: row.notes,
      ratings: row.ratings as ScorecardDto['ratings'],
      recommendation: row.recommendation,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** A single-use, prompt-locked credential for the AI voice interviewer. */
  async voiceToken(user: AuthUser, sessionId: string): Promise<VoiceTokenDto> {
    const { role, status } = await this.sessions.requireParticipant(user, sessionId);
    const s = await this.load(sessionId);
    if (role === 'VIEWER') throw new ForbiddenError('Viewers cannot talk to the interviewer');
    if (status !== 'LIVE')
      throw new AppError(409, ErrorCode.SESSION_NOT_LIVE, 'The session is not live');
    if (s.hostId !== user.id && !s.interviewStartedAt)
      throw conflict('Wait for the interviewer to start the interview');
    if (s.interviewEndedAt) throw conflict('This interview has ended');
    if (!this.live.enabled)
      throw new AppError(
        503,
        ErrorCode.AI_UNAVAILABLE,
        'The voice interviewer is not configured on this server',
      );

    if (!(await this.cache.setIfAbsent(`voice:cooldown:${user.id}`, VOICE_LIMITS.cooldownS)))
      throw new AppError(429, ErrorCode.RATE_LIMITED, 'Please wait a few seconds and try again');
    const day = new Date().toISOString().slice(0, 10);
    if ((await this.cache.incr(`voice:day:${day}:${user.id}`, 86_400)) > VOICE_LIMITS.perDay)
      throw new AppError(
        429,
        ErrorCode.RATE_LIMITED,
        `You can start ${VOICE_LIMITS.perDay} voice interviews a day`,
      );

    const remaining = s.interviewEndsAt
      ? Math.ceil((s.interviewEndsAt.getTime() - Date.now()) / 60_000)
      : VOICE_LIMITS.maxMinutes;
    try {
      const t = await this.live.issue({
        systemInstruction: interviewerInstruction({
          title: s.problemTitle ?? 'Coding problem',
          statement: s.problemStatement ?? '',
        }),
        maxMinutes: Math.max(5, Math.min(VOICE_LIMITS.maxMinutes, remaining + 2)),
      });
      return {
        token: t.token,
        model: t.model,
        connectBy: t.connectBy.toISOString(),
        expiresAt: t.expiresAt.toISOString(),
      };
    } catch (err) {
      this.logger.warn({ err: (err as Error).message, sessionId }, 'voice token failed');
      throw new AppError(
        503,
        ErrorCode.AI_UNAVAILABLE,
        'Could not start the voice interviewer. Please try again shortly.',
      );
    }
  }

  async createFeedback(
    user: AuthUser,
    sessionId: string,
    input: InterviewFeedbackRequest,
  ): Promise<InterviewFeedbackDto> {
    const { role } = await this.sessions.requireParticipant(user, sessionId);
    if (role === 'VIEWER') throw new ForbiddenError('Viewers cannot request feedback');
    const s = await this.load(sessionId);
    const data = interviewFeedbackRequestSchema.parse(input);
    if (!data.transcript.some((t) => t.role === 'candidate'))
      throw new AppError(422, ErrorCode.VALIDATION_FAILED, 'The transcript has no answers yet');
    if (!(await this.cache.setIfAbsent(`feedback:cooldown:${user.id}`, FEEDBACK_COOLDOWN_S)))
      throw new AppError(429, ErrorCode.RATE_LIMITED, 'Feedback was just generated; wait a moment');

    const result = await this.ai.interviewFeedback({
      problem: { title: s.problemTitle ?? '', statement: s.problemStatement ?? '' },
      transcript: data.transcript,
      code: data.code,
    });
    const { model, ...feedback } = result;
    const row = await this.db.interviewFeedback.create({
      data: {
        sessionId,
        userId: user.id,
        transcript: data.transcript,
        code: data.code,
        feedback,
        model,
      },
    });
    return this.toFeedbackDto(row);
  }

  /** The caller's own feedback for this session, newest first. */
  async listFeedback(user: AuthUser, sessionId: string): Promise<InterviewFeedbackDto[]> {
    await this.sessions.requireParticipant(user, sessionId);
    const rows = await this.db.interviewFeedback.findMany({
      where: { sessionId, userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    return rows.map((r) => this.toFeedbackDto(r));
  }

  private toFeedbackDto(r: {
    id: string;
    sessionId: string;
    feedback: unknown;
    transcript: unknown;
    model: string;
    createdAt: Date;
  }): InterviewFeedbackDto {
    return {
      ...(r.feedback as Omit<InterviewFeedbackDto, 'id'>),
      id: r.id,
      sessionId: r.sessionId,
      model: r.model,
      isDemo: r.model === 'demo',
      turns: (r.transcript as TranscriptEntry[]).length,
      createdAt: r.createdAt.toISOString(),
    };
  }
}
