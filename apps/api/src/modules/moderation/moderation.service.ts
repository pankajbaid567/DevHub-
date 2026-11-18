import {
  ErrorCode,
  type CreateReportInput,
  type ModerationItemDto,
  type ModerationTriage,
  type ReportReason,
  type ReportTarget,
  type ResolveReportsInput,
} from '@devhub/shared';
import type { Db } from '../../lib/prisma.js';
import type { Cache } from '../../lib/cache.js';
import type { Logger } from '../../lib/logger.js';
import type { AuthUser } from '../../middleware/auth.js';
import type { JobQueue } from '../../jobs/queue.js';
import type { AiService } from '../ai/ai.service.js';
import type { QuestionsService } from '../questions/questions.service.js';
import type { SnippetsService } from '../snippets/snippets.service.js';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '../../core/errors.js';
import { isUniqueViolation } from '../../core/tx.js';
import { toUserSummary, userSummarySelect } from '../../core/mappers.js';

const REPORTS_PER_HOUR = 10;

interface Target {
  title: string;
  body: string;
  link: string;
  authorId: string;
  author: Parameters<typeof toUserSummary>[0];
}

const excerpt = (s: string, n = 280) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * User reports and the admin moderation queue.
 *
 * - Reporting is idempotent per (user, item) by a unique constraint, rate-limited per user,
 *   and you cannot report your own content.
 * - Each report enqueues an AI triage job; the structured verdict (validated with zod) only
 *   *prioritises* the queue: a human always makes the decision.
 * - Resolving acts on every open report for the item at once and records who did what.
 */
export class ModerationService {
  constructor(
    private readonly db: Db,
    private readonly cache: Cache,
    private readonly queue: JobQueue,
    private readonly ai: AiService,
    private readonly questions: QuestionsService,
    private readonly snippets: SnippetsService,
    private readonly logger: Logger,
  ) {}

  private async target(type: ReportTarget, id: string): Promise<Target | null> {
    const author = { select: userSummarySelect };
    if (type === 'QUESTION') {
      const q = await this.db.question.findUnique({ where: { id }, include: { author } });
      return (
        q && {
          title: q.title,
          body: q.body,
          link: `/questions/${q.id}`,
          authorId: q.authorId,
          author: q.author,
        }
      );
    }
    if (type === 'ANSWER') {
      const a = await this.db.answer.findUnique({
        where: { id },
        include: { author, question: { select: { id: true, title: true } } },
      });
      return (
        a && {
          title: `Answer on "${a.question.title}"`,
          body: a.body,
          link: `/questions/${a.question.id}#answer-${a.id}`,
          authorId: a.authorId,
          author: a.author,
        }
      );
    }
    const s = await this.db.snippet.findUnique({ where: { id }, include: { author } });
    if (!s || s.visibility === 'PRIVATE') return null;
    return {
      title: s.title,
      body: `${s.description}\n\n${s.code}`,
      link: `/snippets/${s.id}`,
      authorId: s.authorId,
      author: s.author,
    };
  }

  async report(user: AuthUser, input: CreateReportInput): Promise<{ id: string }> {
    const t = await this.target(input.targetType, input.targetId);
    if (!t) throw new NotFoundError('Content');
    if (t.authorId === user.id) throw new ForbiddenError('You cannot report your own post');

    const key = `reports:rate:${user.id}`;
    const n = (await this.cache.get<number>(key)) ?? 0;
    if (n >= REPORTS_PER_HOUR)
      throw new AppError(
        429,
        ErrorCode.RATE_LIMITED,
        'You have sent a lot of reports; try again later',
      );

    try {
      const r = await this.db.report.create({
        data: {
          reporterId: user.id,
          targetType: input.targetType,
          targetId: input.targetId,
          reason: input.reason,
          details: input.details ?? null,
        },
      });
      await this.cache.set(key, n + 1, 3_600);
      await this.queue.add('moderation.triage', { reportId: r.id });
      return { id: r.id };
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError('You already reported this');
      throw err;
    }
  }

  /** Job: AI triage of the reported content (cached per item, best-effort). */
  async triage(reportId: string): Promise<void> {
    const r = await this.db.report.findUnique({ where: { id: reportId } });
    if (!r || r.status !== 'OPEN' || r.aiTriage) return;
    const cacheKey = `triage:${r.targetType}:${r.targetId}`;
    let verdict = await this.cache.get<ModerationTriage & { model: string }>(cacheKey);
    if (!verdict) {
      const t = await this.target(r.targetType as ReportTarget, r.targetId);
      if (!t) return; // already deleted
      verdict = await this.ai.triageContent(`${t.title}\n\n${t.body}`);
      await this.cache.set(cacheKey, verdict, 3_600);
    }
    // One verdict per item: every open report of it shares the result.
    await this.db.report.updateMany({
      where: { targetType: r.targetType, targetId: r.targetId, status: 'OPEN' },
      data: { aiTriage: verdict },
    });
  }

  /**
   * Open items, most urgent first: AI "likely violation" before "unclear" before "likely ok",
   * then by number of distinct reporters, then oldest first.
   */
  async queueItems(): Promise<ModerationItemDto[]> {
    const groups = await this.db.report.groupBy({
      by: ['targetType', 'targetId'],
      where: { status: 'OPEN' },
      _count: { _all: true },
      _min: { createdAt: true },
    });
    const items: ModerationItemDto[] = [];
    for (const g of groups) {
      const type = g.targetType as ReportTarget;
      const [t, reports] = await Promise.all([
        this.target(type, g.targetId),
        this.db.report.findMany({
          where: { status: 'OPEN', targetType: g.targetType, targetId: g.targetId },
          select: { reason: true, details: true, aiTriage: true },
        }),
      ]);
      items.push({
        targetType: type,
        targetId: g.targetId,
        link: t?.link ?? '',
        title: t?.title ?? '(deleted)',
        excerpt: t ? excerpt(t.body) : '',
        author: t ? toUserSummary(t.author) : null,
        reportCount: g._count._all,
        reasons: [...new Set(reports.map((r) => r.reason as ReportReason))],
        details: reports.map((r) => r.details).filter((d): d is string => Boolean(d)),
        firstReportedAt: g._min.createdAt!.toISOString(),
        triage: (reports.find((r) => r.aiTriage)?.aiTriage as ModerationItemDto['triage']) ?? null,
      });
    }
    const rank = { likely_violation: 0, unclear: 1, likely_ok: 2 } as const;
    return items.sort(
      (a, b) =>
        (a.triage ? rank[a.triage.verdict] : 1) - (b.triage ? rank[b.triage.verdict] : 1) ||
        b.reportCount - a.reportCount ||
        a.firstReportedAt.localeCompare(b.firstReportedAt),
    );
  }

  async resolve(admin: AuthUser, input: ResolveReportsInput): Promise<{ resolved: number }> {
    const where = {
      targetType: input.targetType,
      targetId: input.targetId,
      status: 'OPEN' as const,
    };
    if (!(await this.db.report.count({ where })))
      throw new NotFoundError('Open reports for this item');
    if (input.action === 'remove' && (await this.target(input.targetType, input.targetId))) {
      // Through the owning services (admins pass their policies), so counters, reputation and
      // the ledger are reversed exactly as when an author deletes their own post.
      if (input.targetType === 'QUESTION') await this.questions.remove(admin, input.targetId);
      else if (input.targetType === 'ANSWER')
        await this.questions.removeAnswer(admin, input.targetId);
      else await this.snippets.remove(admin, input.targetId);
      this.logger.info({ admin: admin.id, ...input }, 'moderation: content removed');
    }
    const { count } = await this.db.report.updateMany({
      where,
      data: {
        status: input.action === 'remove' ? 'RESOLVED' : 'DISMISSED',
        resolvedById: admin.id,
        resolvedAt: new Date(),
        resolution: `${input.action}${input.note ? `: ${input.note}` : ''}`,
      },
    });
    return { resolved: count };
  }
}
