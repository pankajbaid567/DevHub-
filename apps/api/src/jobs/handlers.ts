import type { Db } from '../lib/prisma.js';
import type { Logger } from '../lib/logger.js';
import type { Mailer } from './mailer.js';
import type { Outbox } from './outbox.js';
import type { JobHandlers } from './queue.js';
import type { TokenService } from '../modules/auth/token.service.js';
import type { NotificationsService } from '../modules/notifications/notifications.service.js';
import type { SearchIndexer } from '../modules/search/indexer.js';
import type { ModerationService } from '../modules/moderation/moderation.service.js';

export interface HandlerDeps {
  db: Db;
  logger: Logger;
  mailer: Mailer;
  outbox: Outbox;
  tokens: TokenService;
  notifications: NotificationsService;
  indexer: SearchIndexer;
  /** Late-bound: the moderation service depends on the queue that runs this job. */
  moderation: () => ModerationService;
}

/**
 * Job handlers. Every handler must be safe to run more than once (delivery is
 * at-least-once): each one checks current state before acting.
 */
export function createHandlers(d: HandlerDeps): JobHandlers {
  return {
    'email.send': (msg) => d.mailer.send(msg),

    'search.index': ({ kind, id }) => d.indexer.index(kind, id),

    'moderation.triage': ({ reportId }) => d.moderation().triage(reportId),

    'search.reconcile': async () => {
      const n = await d.indexer.reconcile();
      if (n) d.logger.info({ indexed: n }, 'search index reconciled');
    },

    'session.reminder': async ({ sessionId }) => {
      // Atomic claim: of any number of concurrent or re-delivered runs, exactly one gets the row.
      const [s] = await d.db.$queryRaw<{ title: string; hostId: string }[]>`
        UPDATE sessions SET "reminderSentAt" = now()
        WHERE id = ${sessionId} AND status = 'SCHEDULED' AND "reminderSentAt" IS NULL
        RETURNING title, "hostId"`;
      if (!s) return; // already sent, started early, ended or deleted
      const participants = await d.db.sessionParticipant.findMany({
        where: { sessionId },
        select: { userId: true },
      });
      const title = s.title.length > 80 ? `${s.title.slice(0, 79)}…` : s.title;
      for (const { userId } of participants) {
        await d.notifications.notify(
          userId,
          userId === s.hostId ? null : s.hostId,
          'SESSION_REMINDER',
          `"${title}" starts in about 10 minutes`,
          `/sessions/${sessionId}`,
        );
      }
    },

    'maintenance.cleanup': async () => {
      const [tokens, outbox] = await Promise.all([d.tokens.purgeExpired(), d.outbox.prune()]);
      const emailTokens = await d.db.emailToken.deleteMany({
        where: { expiresAt: { lt: new Date(Date.now() - 86_400_000) } },
      });
      d.logger.info(
        { refreshTokens: tokens, outboxRows: outbox, emailTokens: emailTokens.count },
        'maintenance cleanup',
      );
    },
  };
}
