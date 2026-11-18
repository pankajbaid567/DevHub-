import type {
  ActivityItem,
  CurrentUser,
  DashboardDto,
  LeaderboardEntry,
  ProfileDto,
  SkillDto,
  TagDto,
  UpdateProfileInput,
} from '@devhub/shared';
import type { Db } from '../../lib/prisma.js';
import { cached, type Cache } from '../../lib/cache.js';
import { NotFoundError } from '../../core/errors.js';
import { toUserSummary, userSummarySelect } from '../../core/mappers.js';
import { currentUserSelect, toCurrentUser } from '../auth/auth.service.js';

const DAY = 86_400_000;

export class UsersService {
  constructor(
    private readonly db: Db,
    private readonly cache: Cache,
  ) {}

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<CurrentUser> {
    const u = await this.db.user.update({
      where: { id: userId },
      data: input,
      select: currentUserSelect,
    });
    return toCurrentUser(u);
  }

  async profile(username: string): Promise<ProfileDto> {
    const u = await this.db.user.findUnique({
      where: { username: username.toLowerCase() },
      select: {
        ...userSummarySelect,
        bio: true,
        createdAt: true,
        skills: {
          orderBy: { rating: 'desc' },
          select: { name: true, rating: true, updatedAt: true },
        },
        _count: { select: { questions: true, answers: true, hostedSessions: true } },
      },
    });
    if (!u) throw new NotFoundError('User');

    const [acceptedAnswers, snippets, topTags] = await Promise.all([
      this.db.answer.count({ where: { authorId: u.id, acceptedOn: { isNot: null } } }),
      this.db.snippet.count({ where: { authorId: u.id, visibility: 'PUBLIC' } }),
      this.db.$queryRaw<{ name: string; count: bigint }[]>`
        SELECT t.name, COUNT(*) AS count
        FROM answers a
        JOIN "_QuestionToTag" qt ON qt."A" = a."questionId"
        JOIN tags t ON t.id = qt."B"
        WHERE a."authorId" = ${u.id}
        GROUP BY t.name ORDER BY count DESC LIMIT 5`,
    ]);

    return {
      ...toUserSummary(u),
      bio: u.bio,
      createdAt: u.createdAt.toISOString(),
      stats: {
        questions: u._count.questions,
        answers: u._count.answers,
        acceptedAnswers,
        snippets,
        sessionsHosted: u._count.hostedSessions,
      },
      topTags: topTags.map((t) => ({ name: t.name, count: Number(t.count) })),
      skills: u.skills.map(toSkillDto),
    };
  }

  async dashboard(userId: string): Promise<DashboardDto> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { ...userSummarySelect, username: true },
    });
    if (!user) throw new NotFoundError('User');
    const profile = await this.profile(user.username);
    const since30 = new Date(Date.now() - 30 * DAY);
    const since7 = new Date(Date.now() - 7 * DAY);

    const [events, unread, questions, answers, snippets, liveSessions, myTags] = await Promise.all([
      this.db.reputationEvent.findMany({
        where: { userId, createdAt: { gte: since30 } },
        orderBy: { createdAt: 'asc' },
        select: { delta: true, reason: true, createdAt: true },
      }),
      this.db.notification.count({ where: { userId, readAt: null } }),
      this.db.question.findMany({
        where: { authorId: userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, title: true, createdAt: true },
      }),
      this.db.answer.findMany({
        where: { authorId: userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, createdAt: true, question: { select: { id: true, title: true } } },
      }),
      this.db.snippet.findMany({
        where: { authorId: userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, title: true, createdAt: true },
      }),
      this.db.session.findMany({
        where: { status: 'LIVE', visibility: 'PUBLIC' },
        orderBy: { startedAt: 'desc' },
        take: 5,
        select: { id: true, title: true, _count: { select: { participants: true } } },
      }),
      Promise.resolve(profile.topTags.map((t) => t.name)),
    ]);

    const unansweredInMyTags = myTags.length
      ? await this.db.question.findMany({
          where: {
            answerCount: 0,
            authorId: { not: userId },
            tags: { some: { name: { in: myTags } } },
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { id: true, title: true, tags: { select: { name: true } } },
        })
      : [];

    // Running reputation per day for the sparkline: work backwards from today's total.
    const byDay = new Map<string, number>();
    for (const e of events) {
      const d = e.createdAt.toISOString().slice(0, 10);
      byDay.set(d, (byDay.get(d) ?? 0) + e.delta);
    }
    const history: DashboardDto['reputationHistory'] = [];
    let running = user.reputation;
    for (let i = 0; i < 30; i++) {
      const date = new Date(Date.now() - i * DAY).toISOString().slice(0, 10);
      history.push({ date, reputation: running });
      running -= byDay.get(date) ?? 0;
    }
    history.reverse();

    const activity: ActivityItem[] = [
      ...questions.map((q) => ({
        type: 'question' as const,
        id: q.id,
        title: q.title,
        createdAt: q.createdAt.toISOString(),
      })),
      ...answers.map((a) => ({
        type: 'answer' as const,
        id: a.id,
        questionId: a.question.id,
        questionTitle: a.question.title,
        createdAt: a.createdAt.toISOString(),
      })),
      ...snippets.map((s) => ({
        type: 'snippet' as const,
        id: s.id,
        title: s.title,
        createdAt: s.createdAt.toISOString(),
      })),
      ...events.slice(-5).map((e) => ({
        type: 'reputation' as const,
        delta: e.delta,
        reason: e.reason,
        createdAt: e.createdAt.toISOString(),
      })),
    ]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 10);

    return {
      user: toUserSummary(user),
      stats: {
        ...profile.stats,
        reputationThisWeek: events
          .filter((e) => e.createdAt >= since7)
          .reduce((s, e) => s + e.delta, 0),
        unreadNotifications: unread,
      },
      reputationHistory: history,
      recentActivity: activity,
      liveSessions: liveSessions.map((s) => ({
        id: s.id,
        title: s.title,
        participantCount: s._count.participants,
      })),
      unansweredInMyTags: unansweredInMyTags.map((q) => ({
        id: q.id,
        title: q.title,
        tags: q.tags.map((t) => t.name),
      })),
    };
  }

  /** Cached for 60 s: it is read on every visit to /leaderboard but changes slowly. */
  leaderboard(limit = 20): Promise<LeaderboardEntry[]> {
    return cached(this.cache, `leaderboard:${limit}`, 60, async () => {
      const rows = await this.db.user.findMany({
        orderBy: [{ reputation: 'desc' }, { createdAt: 'asc' }],
        take: limit,
        select: { ...userSummarySelect, _count: { select: { answers: true } } },
      });
      return rows.map((u, i) => ({ ...toUserSummary(u), rank: i + 1, answers: u._count.answers }));
    });
  }

  async skills(userId: string): Promise<SkillDto[]> {
    const rows = await this.db.skillRating.findMany({
      where: { userId },
      orderBy: { rating: 'desc' },
    });
    return rows.map(toSkillDto);
  }

  /** Replaces the user's skill list in one transaction (delete missing, upsert the rest). */
  async replaceSkills(
    userId: string,
    skills: { name: string; rating: number }[],
  ): Promise<SkillDto[]> {
    const unique = [
      ...new Map(skills.map((s) => [s.name.toLowerCase(), { ...s, name: s.name.trim() }])).values(),
    ];
    await this.db.$transaction([
      this.db.skillRating.deleteMany({
        where: { userId, name: { notIn: unique.map((s) => s.name) } },
      }),
      ...unique.map((s) =>
        this.db.skillRating.upsert({
          where: { userId_name: { userId, name: s.name } },
          create: { userId, name: s.name, rating: s.rating },
          update: { rating: s.rating },
        }),
      ),
    ]);
    return this.skills(userId);
  }

  /** Popular tags with usage counts, cached for 5 minutes and invalidated on new questions. */
  popularTags(q?: string): Promise<TagDto[]> {
    const load = async () => {
      const rows = await this.db.tag.findMany({
        where: q ? { name: { startsWith: q.toLowerCase() } } : {},
        select: { name: true, _count: { select: { questions: true, snippets: true } } },
        orderBy: { questions: { _count: 'desc' } },
        take: 30,
      });
      return rows.map((t) => ({
        name: t.name,
        questionCount: t._count.questions,
        snippetCount: t._count.snippets,
      }));
    };
    return q ? load() : cached(this.cache, 'tags:popular', 300, load);
  }
}

const toSkillDto = (s: { name: string; rating: number; updatedAt: Date }): SkillDto => ({
  name: s.name,
  rating: s.rating,
  updatedAt: s.updatedAt.toISOString(),
});
