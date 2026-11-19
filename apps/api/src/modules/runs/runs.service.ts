import {
  ErrorCode,
  type CodeRunDto,
  type RunCodeInput,
  type RunnableLanguage,
} from '@devhub/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../../lib/prisma.js';
import type { Cache } from '../../lib/cache.js';
import type { Logger } from '../../lib/logger.js';
import type { AuthUser } from '../../middleware/auth.js';
import { AppError, ForbiddenError } from '../../core/errors.js';
import { toUserSummary, userSummarySelect } from '../../core/mappers.js';
import type { SessionsService } from '../sessions/sessions.service.js';
import type { CodeRunner } from './runner.client.js';

const include = { user: { select: userSummarySelect } } satisfies Prisma.CodeRunInclude;
type Row = Prisma.CodeRunGetPayload<{ include: typeof include }>;

const toDto = (r: Row): CodeRunDto => ({
  id: r.id,
  sessionId: r.sessionId,
  user: toUserSummary(r.user),
  language: r.language as RunnableLanguage,
  status: r.status as CodeRunDto['status'],
  stdout: r.stdout,
  stderr: r.stderr,
  exitCode: r.exitCode,
  durationMs: r.durationMs,
  createdAt: r.createdAt.toISOString(),
});

/** Real-time fan-out of run events to the session room (implemented by the socket layer). */
export interface RunBroadcaster {
  runStarted(sessionId: string, user: CodeRunDto['user'], language: string): void;
  runFinished(run: CodeRunDto): void;
}

const LOCK_TTL_S = 30;
const USER_COOLDOWN_S = 2;

/**
 * Runs the shared editor's code in the sandbox and shares the result with the room.
 * Guard rails: editors only, live sessions only, one run per session at a time (a
 * distributed lock in Redis, so it holds across replicas) and a short per-user cooldown.
 */
export class RunsService {
  constructor(
    private readonly db: Db,
    private readonly cache: Cache,
    private readonly sessions: SessionsService,
    private readonly runner: CodeRunner,
    private readonly logger: Logger,
  ) {}

  get enabled(): boolean {
    return this.runner.enabled;
  }

  /**
   * Runs `fn` holding the session's run slot, after the shared checks: editors only, live
   * sessions only, the runner configured, a per-user cooldown and one execution per session at
   * a time (a Redis lock, so it holds across replicas). Test submissions use it too.
   */
  async exclusive<T>(
    user: AuthUser,
    sessionId: string,
    fn: (author: CodeRunDto['user']) => Promise<T>,
  ): Promise<T> {
    const { role, status } = await this.sessions.requireParticipant(user, sessionId);
    if (status !== 'LIVE')
      throw new AppError(409, ErrorCode.SESSION_NOT_LIVE, 'Code can only run in a live session');
    if (role === 'VIEWER') throw new ForbiddenError('Viewers cannot run code');
    if (!this.runner.enabled)
      throw new AppError(
        503,
        ErrorCode.INTERNAL,
        'Code execution is not configured on this server',
      );

    if (!(await this.cache.setIfAbsent(`run:cooldown:${user.id}`, USER_COOLDOWN_S)))
      throw new AppError(429, ErrorCode.RATE_LIMITED, 'Slow down: one run every few seconds');
    const lock = `run:lock:${sessionId}`;
    if (!(await this.cache.setIfAbsent(lock, LOCK_TTL_S)))
      throw new AppError(409, ErrorCode.CONFLICT, 'Code is already running in this session');
    try {
      const author = await this.db.user.findUniqueOrThrow({
        where: { id: user.id },
        select: userSummarySelect,
      });
      return await fn(toUserSummary(author));
    } finally {
      await this.cache.del(lock);
    }
  }

  /** Executes code in the sandbox; runner outages come back as a `failed` result. */
  async execute(input: RunCodeInput): Promise<{
    status: CodeRunDto['status'];
    stdout: string;
    stderr: string;
    exitCode: number | null;
    durationMs: number;
  }> {
    try {
      // Pick the fields: the runner's response carries more (e.g. `signal`) than we store.
      const { status, stdout, stderr, exitCode, durationMs } = await this.runner.run(input);
      return { status, stdout, stderr, exitCode, durationMs };
    } catch (err) {
      this.logger.warn({ err: (err as Error).message }, 'code run failed');
      return {
        status: 'failed',
        stdout: '',
        stderr: (err as Error).message,
        exitCode: null,
        durationMs: 0,
      };
    }
  }

  async run(
    user: AuthUser,
    sessionId: string,
    input: RunCodeInput,
    broadcast: RunBroadcaster,
  ): Promise<CodeRunDto> {
    return this.exclusive(user, sessionId, async (author) => {
      broadcast.runStarted(sessionId, author, input.language);
      const result = await this.execute(input);
      const row = await this.db.codeRun.create({
        data: {
          sessionId,
          userId: user.id,
          language: input.language,
          code: input.code,
          stdin: input.stdin ?? null,
          ...result,
        },
        include,
      });
      const dto = toDto(row);
      broadcast.runFinished(dto);
      return dto;
    });
  }

  async history(user: AuthUser, sessionId: string, limit = 10): Promise<CodeRunDto[]> {
    await this.sessions.requireParticipant(user, sessionId);
    const rows = await this.db.codeRun.findMany({
      where: { sessionId },
      include,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(toDto);
  }
}
