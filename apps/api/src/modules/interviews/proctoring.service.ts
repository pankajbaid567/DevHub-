import {
  type ProctoringConfigDto,
  type ProctoringEventDto,
  type ProctoringEventInput,
  type ProctoringEventType,
  type ProctoringStatusDto,
  proctoringEventSchema,
} from '@devhub/shared';
import type { Db } from '../../lib/prisma.js';
import type { Logger } from '../../lib/logger.js';
import type { AuthUser } from '../../middleware/auth.js';
import { ForbiddenError, NotFoundError } from '../../core/errors.js';

/** Rate limit: max events per user per session to prevent spam. */
const MAX_EVENTS_PER_SESSION = 200;

/**
 * Records and retrieves proctoring events for interview sessions.
 * Events are written by the candidate's browser (via socket) and read only by the
 * interviewer (host). This follows the same access pattern as the scorecard: the host
 * sees everything, the candidate sees nothing.
 */
export class ProctoringService {
  constructor(
    private readonly db: Db,
    private readonly logger: Logger,
  ) {}

  async recordEvent(
    user: AuthUser,
    sessionId: string,
    input: ProctoringEventInput,
  ): Promise<ProctoringEventDto> {
    const data = proctoringEventSchema.parse(input);
    const session = await this.db.session.findUnique({
      where: { id: sessionId },
      select: { mode: true, proctoringConfig: true, interviewEndedAt: true },
    });
    if (!session) throw new NotFoundError('Session');
    if (session.mode !== 'INTERVIEW') throw new ForbiddenError('Not an interview session');
    const config = session.proctoringConfig as ProctoringConfigDto | null;
    if (!config?.enabled) throw new ForbiddenError('Proctoring is not enabled for this session');
    if (session.interviewEndedAt) return this.stubEvent(sessionId, user, data);

    const count = await this.db.proctoringEvent.count({
      where: { sessionId, userId: user.id },
    });
    if (count >= MAX_EVENTS_PER_SESSION) {
      this.logger.warn({ sessionId, userId: user.id }, 'proctoring event limit reached');
      return this.stubEvent(sessionId, user, data);
    }

    const row = await this.db.proctoringEvent.create({
      data: {
        sessionId,
        userId: user.id,
        type: data.type,
        detail: data.detail,
      },
    });
    const userRow = await this.db.user.findUnique({
      where: { id: user.id },
      select: { username: true },
    });
    return {
      id: row.id,
      sessionId: row.sessionId,
      userId: row.userId,
      username: userRow?.username ?? 'unknown',
      type: row.type as ProctoringEventType,
      detail: row.detail,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** Interviewer-only: all proctoring events for a session. */
  async getStatus(user: AuthUser, sessionId: string): Promise<ProctoringStatusDto> {
    const session = await this.db.session.findUnique({
      where: { id: sessionId },
      select: { hostId: true, mode: true, proctoringConfig: true },
    });
    if (!session) throw new NotFoundError('Session');
    if (session.hostId !== user.id)
      throw new ForbiddenError('Only the interviewer can view proctoring data');

    const config = (session.proctoringConfig as ProctoringConfigDto | null) ?? {
      enabled: false,
      requireCamera: false,
      requireScreenShare: false,
      enforceFullscreen: true,
      blockCopyPaste: true,
    };

    const rows = await this.db.proctoringEvent.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    const userIds = [...new Set(rows.map((r) => r.userId))];
    const users = await this.db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u.username]));

    return {
      events: rows.map((r) => ({
        id: r.id,
        sessionId: r.sessionId,
        userId: r.userId,
        username: userMap.get(r.userId) ?? 'unknown',
        type: r.type as ProctoringEventType,
        detail: r.detail,
        createdAt: r.createdAt.toISOString(),
      })),
      violations: rows.length,
      config,
    };
  }

  private stubEvent(
    sessionId: string,
    user: AuthUser,
    data: ProctoringEventInput,
  ): ProctoringEventDto {
    return {
      id: 'dropped',
      sessionId,
      userId: user.id,
      username: '',
      type: data.type,
      detail: data.detail,
      createdAt: new Date().toISOString(),
    };
  }
}
