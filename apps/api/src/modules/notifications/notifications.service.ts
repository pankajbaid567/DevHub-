import type { NotificationType, Prisma } from '@prisma/client';
import type { CursorPage, CursorQuery, NotificationDto } from '@devhub/shared';
import type { Db } from '../../lib/prisma.js';
import type { EventBus } from '../../core/events.js';
import { toUserSummary, userSummarySelect } from '../../core/mappers.js';

const include = { actor: { select: userSummarySelect } } satisfies Prisma.NotificationInclude;
type Row = Prisma.NotificationGetPayload<{ include: typeof include }>;

const toDto = (n: Row): NotificationDto => ({
  id: n.id,
  type: n.type,
  actor: n.actor ? toUserSummary(n.actor) : null,
  message: n.message,
  link: n.link,
  readAt: n.readAt?.toISOString() ?? null,
  createdAt: n.createdAt.toISOString(),
});

/** Delivers a notification to the user's open sockets. Implemented by the realtime layer. */
export type NotificationPusher = (userId: string, n: NotificationDto) => void;

const truncate = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Persists notifications and pushes them in real time. Subscribes to domain events, so the
 * services that cause notifications (questions, snippets, sessions) do not depend on it.
 */
export class NotificationsService {
  private pusher: NotificationPusher = () => {};

  constructor(private readonly db: Db) {}

  setPusher(pusher: NotificationPusher): void {
    this.pusher = pusher;
  }

  subscribe(events: EventBus): void {
    events.on('answer.created', async (e) => {
      if (e.questionAuthorId === e.actorId) return;
      await this.notify(
        e.questionAuthorId,
        e.actorId,
        'ANSWER_POSTED',
        `answered your question "${truncate(e.questionTitle)}"`,
        `/questions/${e.questionId}#answer-${e.answerId}`,
      );
    });
    events.on('answer.accepted', async (e) => {
      await this.notify(
        e.answerAuthorId,
        e.actorId,
        'ANSWER_ACCEPTED',
        `accepted your answer on "${truncate(e.questionTitle)}"`,
        `/questions/${e.questionId}#answer-${e.answerId}`,
      );
    });
    events.on('content.upvoted', async (e) => {
      const what = e.target === 'QUESTION' ? 'question' : 'answer on';
      const link = `/questions/${e.questionId}${e.answerId ? `#answer-${e.answerId}` : ''}`;
      await this.notify(
        e.authorId,
        e.actorId,
        'CONTENT_UPVOTED',
        `upvoted your ${what} "${truncate(e.title)}"`,
        link,
      );
    });
    events.on('snippet.starred', async (e) => {
      await this.notify(
        e.authorId,
        e.actorId,
        'SNIPPET_STARRED',
        `starred your snippet "${truncate(e.title)}"`,
        `/snippets/${e.snippetId}`,
      );
    });
    events.on('session.started', async (e) => {
      await Promise.all(
        e.participantIds.map((uid) =>
          this.notify(
            uid,
            e.hostId,
            'SESSION_STARTED',
            `started the session "${truncate(e.title)}"`,
            `/sessions/${e.sessionId}`,
          ),
        ),
      );
    });
  }

  async notify(
    userId: string,
    actorId: string | null,
    type: NotificationType,
    message: string,
    link: string,
  ): Promise<void> {
    const n = await this.db.notification.create({
      data: { userId, actorId, type, message, link },
      include,
    });
    this.pusher(userId, toDto(n));
  }

  async list(
    userId: string,
    q: CursorQuery,
  ): Promise<CursorPage<NotificationDto> & { unread: number }> {
    const [rows, unread] = await Promise.all([
      this.db.notification.findMany({
        where: { userId },
        include,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: q.limit + 1,
        ...(q.cursor && { cursor: { id: q.cursor }, skip: 1 }),
      }),
      this.unreadCount(userId),
    ]);
    const page = rows.slice(0, q.limit);
    return {
      items: page.map(toDto),
      nextCursor: rows.length > q.limit ? page[page.length - 1]!.id : null,
      unread,
    };
  }

  unreadCount(userId: string): Promise<number> {
    return this.db.notification.count({ where: { userId, readAt: null } });
  }

  /** Scoped by userId so nobody can mark someone else's notifications. */
  async markRead(
    userId: string,
    input: { ids: string[] } | { all: true },
  ): Promise<{ unread: number }> {
    await this.db.notification.updateMany({
      where: { userId, readAt: null, ...('ids' in input ? { id: { in: input.ids } } : {}) },
      data: { readAt: new Date() },
    });
    return { unread: await this.unreadCount(userId) };
  }
}
