import { randomBytes } from 'node:crypto';
import * as Y from 'yjs';
import { type Prisma } from '../../generated/prisma/client.js';
import { createSessionSchema, DOC_TEXT, ErrorCode, findProblem } from '@devhub/shared';
import { interviewState } from '../interviews/interview.state.js';
import type {
  ReplayPageDto,
  ChatMessageDto,
  CreateSessionInput,
  CursorPage,
  CursorQuery,
  ListSessionsQuery,
  Paginated,
  ParticipantRole,
  SessionDetailDto,
  SessionDto,
} from '@devhub/shared';
import type { Db } from '../../lib/prisma.js';
import type { EventBus } from '../../core/events.js';
import type { Outbox } from '../../jobs/outbox.js';
import type { AuthUser } from '../../middleware/auth.js';
import { AppError, ForbiddenError, NotFoundError } from '../../core/errors.js';
import { assertCan, policies } from '../../core/policies.js';
import { iso, pageMeta, tagConnect, toUserSummary, userSummarySelect } from '../../core/mappers.js';

export const REMINDER_LEAD_MS = 10 * 60_000;

const include = {
  host: { select: userSummarySelect },
  tags: { select: { name: true } },
  _count: { select: { participants: true } },
} satisfies Prisma.SessionInclude;

type Row = Prisma.SessionGetPayload<{ include: typeof include }>;

/** Unambiguous alphabet (no 0/O, 1/I) for invite codes people may read aloud. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const inviteCode = () => Array.from(randomBytes(10), (b) => ALPHABET[b % ALPHABET.length]).join('');

export class SessionsService {
  constructor(
    private readonly db: Db,
    private readonly events: EventBus,
    private readonly outbox: Outbox,
  ) {}

  private toDto(s: Row, viewer: AuthUser | undefined, myRole: ParticipantRole | null): SessionDto {
    return {
      id: s.id,
      title: s.title,
      description: s.description,
      language: s.language,
      mode: s.mode,
      status: s.status,
      visibility: s.visibility,
      maxParticipants: s.maxParticipants,
      participantCount: s._count.participants,
      tags: s.tags.map((t) => t.name).sort(),
      host: toUserSummary(s.host),
      scheduledFor: iso(s.scheduledFor),
      startedAt: iso(s.startedAt),
      endedAt: iso(s.endedAt),
      createdAt: s.createdAt.toISOString(),
      ...(viewer?.id === s.hostId && s.inviteCode ? { inviteCode: s.inviteCode } : {}),
      myRole,
    };
  }

  async list(q: ListSessionsQuery, viewer?: AuthUser): Promise<Paginated<SessionDto>> {
    const where: Prisma.SessionWhereInput =
      q.scope === 'mine' && viewer
        ? { OR: [{ hostId: viewer.id }, { participants: { some: { userId: viewer.id } } }] }
        : { visibility: 'PUBLIC' };
    if (q.status) where.status = q.status;
    else if (q.scope === 'public') where.status = { in: ['LIVE', 'SCHEDULED'] };

    const [total, rows] = await this.db.$transaction([
      this.db.session.count({ where }),
      this.db.session.findMany({
        where,
        include,
        // Live first, then soonest scheduled, then newest.
        orderBy: [{ status: 'asc' }, { scheduledFor: 'asc' }, { createdAt: 'desc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
    ]);
    const roles = await this.rolesOf(
      viewer,
      rows.map((r) => r.id),
    );
    return {
      items: rows.map((r) => this.toDto(r, viewer, roles.get(r.id) ?? null)),
      meta: pageMeta(q.page, q.limit, total),
    };
  }

  async create(user: AuthUser, input: CreateSessionInput): Promise<SessionDto> {
    const data = createSessionSchema.parse(input);
    const startNow = !data.scheduledFor;
    const iv = data.interview;
    const problem = iv?.problemSlug ? findProblem(iv.problemSlug)! : iv?.customProblem;
    const s = await this.db.$transaction(async (tx) => {
      const created = await tx.session.create({
        data: {
          title: data.title,
          description: data.description,
          language: data.language,
          visibility: data.visibility,
          maxParticipants: data.maxParticipants,
          inviteCode: data.visibility === 'PRIVATE' ? inviteCode() : null,
          status: startNow ? 'LIVE' : 'SCHEDULED',
          startedAt: startNow ? new Date() : null,
          scheduledFor: data.scheduledFor ? new Date(data.scheduledFor) : null,
          hostId: user.id,
          ...(iv && {
            mode: 'INTERVIEW' as const,
            problemSlug: iv.problemSlug ?? null,
            problemTitle: problem!.title,
            problemStatement: problem!.statement,
            durationMinutes: iv.durationMinutes,
          }),
          tags: { connectOrCreate: tagConnect(data.tags) },
          participants: { create: { userId: user.id, role: 'HOST' } },
        },
        include,
      });
      // Durable, scheduled side effect: remind everyone 10 minutes before the start.
      if (created.scheduledFor) {
        const at = new Date(
          Math.max(Date.now(), created.scheduledFor.getTime() - REMINDER_LEAD_MS),
        );
        await this.outbox.add(
          tx,
          'session.reminder',
          { sessionId: created.id },
          { availableAt: at },
        );
      }
      return created;
    });
    return this.toDto(s, user, 'HOST');
  }

  /** Detail view. Private sessions are visible to participants only (404 for others). */
  async get(id: string, viewer?: AuthUser): Promise<SessionDetailDto> {
    const s = await this.db.session.findUnique({
      where: { id },
      include: {
        ...include,
        participants: {
          include: { user: { select: userSummarySelect } },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });
    if (!s) throw new NotFoundError('Session');
    const me = viewer ? s.participants.find((p) => p.userId === viewer.id) : undefined;
    if (s.visibility === 'PRIVATE' && !me && viewer?.role !== 'ADMIN')
      throw new NotFoundError('Session');
    return {
      ...this.toDto(s, viewer, me?.role ?? null),
      participants: s.participants.map((p) => ({
        user: toUserSummary(p.user),
        role: p.role,
        joinedAt: p.joinedAt.toISOString(),
      })),
      code: s.code,
      interview: interviewState(s, me?.role === 'HOST'),
    };
  }

  /**
   * Joins a session. Capacity is enforced under a row lock (SELECT ... FOR UPDATE) so two
   * people racing for the last seat cannot both get it. Joining twice is a no-op.
   */
  async join(user: AuthUser, id: string, code?: string): Promise<SessionDto> {
    await this.db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM sessions WHERE id = ${id} FOR UPDATE`;
      if (locked.length === 0) throw new NotFoundError('Session');
      const s = await tx.session.findUniqueOrThrow({
        where: { id },
        select: {
          status: true,
          visibility: true,
          inviteCode: true,
          maxParticipants: true,
          _count: { select: { participants: true } },
        },
      });
      const already = await tx.sessionParticipant.findUnique({
        where: { sessionId_userId: { sessionId: id, userId: user.id } },
      });
      if (already) return;
      if (s.status === 'ENDED')
        throw new AppError(409, ErrorCode.SESSION_NOT_LIVE, 'This session has ended');
      if (s.visibility === 'PRIVATE' && (!code || code.toUpperCase() !== s.inviteCode)) {
        // Same response as a missing session: do not confirm that a private session exists.
        throw new NotFoundError('Session');
      }
      if (s._count.participants >= s.maxParticipants)
        throw new AppError(409, ErrorCode.SESSION_FULL, 'This session is full');
      await tx.sessionParticipant.create({
        data: { sessionId: id, userId: user.id, role: 'EDITOR' },
      });
    });
    const s = await this.db.session.findUniqueOrThrow({ where: { id }, include });
    const roles = await this.rolesOf(user, [id]);
    return this.toDto(s, user, roles.get(id) ?? null);
  }

  async leave(user: AuthUser, id: string): Promise<void> {
    const s = await this.db.session.findUnique({ where: { id }, select: { hostId: true } });
    if (!s) throw new NotFoundError('Session');
    if (s.hostId === user.id)
      throw new ForbiddenError('The host cannot leave; end the session instead');
    await this.db.sessionParticipant.deleteMany({ where: { sessionId: id, userId: user.id } });
  }

  async start(user: AuthUser, id: string): Promise<SessionDto> {
    const s = await this.requireManageable(user, id);
    if (s.status !== 'SCHEDULED')
      throw new AppError(409, ErrorCode.CONFLICT, `Session is already ${s.status.toLowerCase()}`);
    const updated = await this.db.session.update({
      where: { id },
      data: { status: 'LIVE', startedAt: new Date() },
      include,
    });
    const participants = await this.db.sessionParticipant.findMany({
      where: { sessionId: id },
      select: { userId: true },
    });
    void this.events.emit('session.started', {
      sessionId: id,
      title: updated.title,
      hostId: updated.hostId,
      participantIds: participants.map((p) => p.userId).filter((u) => u !== user.id),
    });
    return this.toDto(updated, user, 'HOST');
  }

  async end(user: AuthUser, id: string): Promise<SessionDto> {
    const s = await this.requireManageable(user, id);
    if (s.status === 'ENDED') throw new AppError(409, ErrorCode.CONFLICT, 'Session already ended');
    const updated = await this.db.session.update({
      where: { id },
      data: {
        status: 'ENDED',
        endedAt: new Date(),
        // Ending the session stops a running interview clock too.
        ...(s.mode === 'INTERVIEW' && { interviewEndedAt: s.interviewEndedAt ?? new Date() }),
      },
      include,
    });
    void this.events.emit('session.ended', { sessionId: id });
    return this.toDto(updated, user, 'HOST');
  }

  async regenerateInvite(user: AuthUser, id: string): Promise<{ inviteCode: string }> {
    const s = await this.requireManageable(user, id);
    if (s.visibility !== 'PRIVATE')
      throw new AppError(409, ErrorCode.CONFLICT, 'Only private sessions have invite codes');
    const { inviteCode: code } = await this.db.session.update({
      where: { id },
      data: { inviteCode: inviteCode() },
      select: { inviteCode: true },
    });
    return { inviteCode: code! };
  }

  // ---------------------------------------------------------------- chat & realtime helpers

  /** Keyset pagination (newest first): stable even while messages keep arriving. */
  async messages(
    user: AuthUser,
    sessionId: string,
    q: CursorQuery,
  ): Promise<CursorPage<ChatMessageDto>> {
    await this.requireParticipant(user, sessionId);
    const rows = await this.db.message.findMany({
      where: { sessionId },
      include: { author: { select: userSummarySelect } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor && { cursor: { id: q.cursor }, skip: 1 }),
    });
    const hasMore = rows.length > q.limit;
    const page = rows.slice(0, q.limit);
    return { items: page.map(toChatDto), nextCursor: hasMore ? page[page.length - 1]!.id : null };
  }

  async postMessage(user: AuthUser, sessionId: string, content: string): Promise<ChatMessageDto> {
    const { status } = await this.requireParticipant(user, sessionId);
    if (status !== 'LIVE')
      throw new AppError(
        409,
        ErrorCode.SESSION_NOT_LIVE,
        'Chat is only open while the session is live',
      );
    const m = await this.db.message.create({
      data: { sessionId, authorId: user.id, content },
      include: { author: { select: userSummarySelect } },
    });
    return toChatDto(m);
  }

  /** Returns the caller's role; throws 404 for non-participants of private sessions, 403 otherwise. */
  async requireParticipant(
    user: AuthUser,
    sessionId: string,
  ): Promise<{ role: ParticipantRole; status: Row['status']; language: string }> {
    const s = await this.db.session.findUnique({
      where: { id: sessionId },
      select: {
        status: true,
        visibility: true,
        language: true,
        participants: { where: { userId: user.id }, select: { role: true } },
      },
    });
    if (!s) throw new NotFoundError('Session');
    const p = s.participants[0];
    if (!p) {
      if (s.visibility === 'PRIVATE') throw new NotFoundError('Session');
      throw new ForbiddenError('Join the session first');
    }
    return { role: p.role, status: s.status, language: s.language };
  }

  /**
   * Persists a document update by CRDT-merging it with the stored state under a row lock,
   * so concurrent saves from different API instances can never overwrite each other's edits.
   * Returns the merged state, which the caller applies to catch up with other instances.
   */
  async mergeDocument(sessionId: string, update: Uint8Array): Promise<Uint8Array> {
    return this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ docState: Uint8Array | null }[]>`
        SELECT "docState" FROM sessions WHERE id = ${sessionId} FOR UPDATE`;
      if (rows.length === 0) throw new NotFoundError('Session');
      const doc = new Y.Doc();
      const stored = rows[0]!.docState;
      if (stored) Y.applyUpdate(doc, new Uint8Array(stored));
      Y.applyUpdate(doc, update);
      const merged = Y.encodeStateAsUpdate(doc); // compact: one consolidated update
      const text = doc.getText(DOC_TEXT).toString();
      doc.destroy();
      await tx.session.update({
        where: { id: sessionId },
        data: { docState: Buffer.from(merged), code: text },
      });
      return merged;
    });
  }

  async loadDocument(
    sessionId: string,
  ): Promise<{ state: Uint8Array | null; code: string } | null> {
    const s = await this.db.session.findUnique({
      where: { id: sessionId },
      select: { docState: true, code: true },
    });
    return s ? { state: s.docState ? new Uint8Array(s.docState) : null, code: s.code } : null;
  }

  /**
   * A page of the session's edit log for replay (participants only). Updates are opaque Yjs
   * binaries (base64); the client applies them in order to rebuild any moment.
   */
  async replay(
    user: AuthUser,
    sessionId: string,
    after: string,
    limit: number,
  ): Promise<ReplayPageDto> {
    await this.requireParticipant(user, sessionId);
    const rows = await this.db.sessionUpdate.findMany({
      where: { sessionId, id: { gt: BigInt(after) } },
      orderBy: { id: 'asc' },
      take: limit + 1,
      select: { id: true, userId: true, update: true, createdAt: true },
    });
    const page = rows.slice(0, limit);
    return {
      items: page.map((r) => ({
        id: r.id.toString(),
        t: r.createdAt.toISOString(),
        userId: r.userId,
        update: Buffer.from(r.update).toString('base64'),
      })),
      nextAfter: rows.length > limit ? page[page.length - 1]!.id.toString() : null,
    };
  }

  private async requireManageable(user: AuthUser, id: string) {
    const s = await this.db.session.findUnique({
      where: { id },
      select: { hostId: true, status: true, visibility: true, mode: true, interviewEndedAt: true },
    });
    if (!s) throw new NotFoundError('Session');
    assertCan(policies.canManageSession(user, s.hostId), 'Only the host can do that');
    return s;
  }

  private async rolesOf(
    viewer: AuthUser | undefined,
    ids: string[],
  ): Promise<Map<string, ParticipantRole>> {
    if (!viewer || !ids.length) return new Map();
    const rows = await this.db.sessionParticipant.findMany({
      where: { userId: viewer.id, sessionId: { in: ids } },
      select: { sessionId: true, role: true },
    });
    return new Map(rows.map((r) => [r.sessionId, r.role]));
  }
}

function toChatDto(
  m: Prisma.MessageGetPayload<{ include: { author: { select: typeof userSummarySelect } } }>,
): ChatMessageDto {
  return {
    id: m.id,
    sessionId: m.sessionId,
    content: m.content,
    author: toUserSummary(m.author),
    createdAt: m.createdAt.toISOString(),
  };
}
