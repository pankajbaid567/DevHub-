import {
  INTERVIEW_PROBLEMS,
  SYSTEM_DESIGN_PROBLEMS,
  BADGE_DEFINITIONS,
  CP_PLATFORM_URLS,
  type CpPlatform,
  type CpProfileDto,
  type ProblemBookmarkDto,
  type ProblemNoteDto,
  type ProblemProgressDto,
  type PublicProfileDto,
  type UserBadgeDto,
} from '@devhub/shared';
import type { Db } from '../../lib/prisma.js';
import type { Cache } from '../../lib/cache.js';
import { NotFoundError } from '../../core/errors.js';
import { toUserSummary, userSummarySelect } from '../../core/mappers.js';

const ALL_TOPICS = [
  ...new Set(
    [...INTERVIEW_PROBLEMS, ...SYSTEM_DESIGN_PROBLEMS].flatMap((p) => p.topics),
  ),
];

const TOPIC_COUNTS = new Map<string, number>();
for (const p of INTERVIEW_PROBLEMS) {
  for (const t of p.topics) TOPIC_COUNTS.set(t, (TOPIC_COUNTS.get(t) ?? 0) + 1);
}
for (const p of SYSTEM_DESIGN_PROBLEMS) {
  for (const t of p.topics) TOPIC_COUNTS.set(t, (TOPIC_COUNTS.get(t) ?? 0) + 1);
}

export class ProgressService {
  constructor(
    private readonly db: Db,
    private readonly cache: Cache,
  ) {}

  // ---------------------------------------------------------------- Progress

  async listProgress(userId: string): Promise<ProblemProgressDto[]> {
    const rows = await this.db.problemProgress.findMany({ where: { userId } });
    return rows.map(toProgressDto);
  }

  async upsertProgress(
    userId: string,
    problemSlug: string,
    passed: number,
    total: number,
    language: string,
  ): Promise<ProblemProgressDto> {
    const solved = passed === total && total > 0;
    const existing = await this.db.problemProgress.findUnique({
      where: { userId_problemSlug: { userId, problemSlug } },
    });
    const data = {
      status: solved ? ('SOLVED' as const) : ('ATTEMPTED' as const),
      attempts: (existing?.attempts ?? 0) + 1,
      bestPassed: Math.max(existing?.bestPassed ?? 0, passed),
      bestTotal: Math.max(existing?.bestTotal ?? 0, total),
      language,
      ...(solved && !existing?.solvedAt ? { solvedAt: new Date() } : {}),
    };
    const row = await this.db.problemProgress.upsert({
      where: { userId_problemSlug: { userId, problemSlug } },
      create: { userId, problemSlug, ...data },
      update: data,
    });
    if (solved) await this.checkBadges(userId);
    return toProgressDto(row);
  }

  // ---------------------------------------------------------------- Bookmarks

  async listBookmarks(userId: string): Promise<ProblemBookmarkDto[]> {
    const rows = await this.db.problemBookmark.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({ problemSlug: r.problemSlug, createdAt: r.createdAt.toISOString() }));
  }

  async toggleBookmark(userId: string, problemSlug: string): Promise<{ bookmarked: boolean }> {
    const existing = await this.db.problemBookmark.findUnique({
      where: { userId_problemSlug: { userId, problemSlug } },
    });
    if (existing) {
      await this.db.problemBookmark.delete({
        where: { userId_problemSlug: { userId, problemSlug } },
      });
      return { bookmarked: false };
    }
    await this.db.problemBookmark.create({ data: { userId, problemSlug } });
    return { bookmarked: true };
  }

  // ---------------------------------------------------------------- Notes

  async getNote(userId: string, problemSlug: string): Promise<ProblemNoteDto> {
    const row = await this.db.problemNote.findUnique({
      where: { userId_problemSlug: { userId, problemSlug } },
    });
    return { problemSlug, content: row?.content ?? '' };
  }

  async upsertNote(userId: string, problemSlug: string, content: string): Promise<ProblemNoteDto> {
    const row = await this.db.problemNote.upsert({
      where: { userId_problemSlug: { userId, problemSlug } },
      create: { userId, problemSlug, content },
      update: { content },
    });
    return { problemSlug, content: row.content };
  }

  // ---------------------------------------------------------------- CP profiles

  async listCpProfiles(userId: string): Promise<CpProfileDto[]> {
    const rows = await this.db.cpPlatformProfile.findMany({ where: { userId } });
    return rows.map(toCpDto);
  }

  async upsertCpProfile(
    userId: string,
    platform: CpPlatform,
    username: string,
  ): Promise<CpProfileDto> {
    const row = await this.db.cpPlatformProfile.upsert({
      where: { userId_platform: { userId, platform } },
      create: { userId, platform, username },
      update: { username, stats: null as any, syncedAt: null },
    });
    return toCpDto(row);
  }

  async removeCpProfile(userId: string, platform: CpPlatform): Promise<void> {
    await this.db.cpPlatformProfile.deleteMany({ where: { userId, platform } });
  }

  async syncCpProfile(userId: string, platform: CpPlatform): Promise<CpProfileDto> {
    const row = await this.db.cpPlatformProfile.findUnique({
      where: { userId_platform: { userId, platform } },
    });
    if (!row) throw new NotFoundError('CP profile');

    let stats: Record<string, unknown> | null = null;
    try {
      if (platform === 'codeforces') {
        const res = await fetch(
          `https://codeforces.com/api/user.info?handles=${encodeURIComponent(row.username)}`,
        );
        if (res.ok) {
          const data = (await res.json()) as { result?: unknown[] };
          if (data.result?.[0]) {
            const u = data.result[0] as Record<string, unknown>;
            stats = {
              rating: u.rating,
              maxRating: u.maxRating,
              rank: u.rank,
              maxRank: u.maxRank,
              contribution: u.contribution,
            };
          }
        }
      }
    } catch {
      // Network failures are silently ignored; stats stay null.
    }

    const updated = await this.db.cpPlatformProfile.update({
      where: { userId_platform: { userId, platform } },
      data: { stats: (stats ?? null) as any, syncedAt: new Date() },
    });
    return toCpDto(updated);
  }

  // ---------------------------------------------------------------- Badges

  async listBadges(userId: string): Promise<UserBadgeDto[]> {
    const rows = await this.db.userBadge.findMany({
      where: { userId },
      orderBy: { earnedAt: 'desc' },
    });
    return rows.map(toBadgeDto);
  }

  async checkBadges(userId: string): Promise<void> {
    const progress = await this.db.problemProgress.findMany({
      where: { userId, status: 'SOLVED' },
    });
    const solved = new Set(progress.map((p) => p.problemSlug));
    const languages = new Set(progress.map((p) => p.language).filter(Boolean));

    const existing = await this.db.userBadge.findMany({
      where: { userId },
      select: { badge: true },
    });
    const has = new Set(existing.map((b) => b.badge));
    const earn = async (badge: string, label: string) => {
      if (has.has(badge)) return;
      await this.db.userBadge.create({ data: { userId, badge, label } }).catch(() => {});
    };

    // First solve
    if (solved.size >= 1) await earn('first-solve', 'First Blood');

    // Difficulty-based
    const easySolved = INTERVIEW_PROBLEMS.filter(
      (p) => p.difficulty === 'Easy' && solved.has(p.slug),
    ).length;
    const mediumSolved = INTERVIEW_PROBLEMS.filter(
      (p) => p.difficulty === 'Medium' && solved.has(p.slug),
    ).length;
    const hardSolved = INTERVIEW_PROBLEMS.filter(
      (p) => p.difficulty === 'Hard' && solved.has(p.slug),
    ).length;
    if (easySolved >= 10) await earn('easy-10', 'Warm-Up King');
    if (mediumSolved >= 10) await earn('medium-10', 'Rising Star');
    if (hardSolved >= 5) await earn('hard-5', 'Hard Hitter');

    // Topic-based
    const topicSolved = (topic: string) =>
      [...INTERVIEW_PROBLEMS, ...SYSTEM_DESIGN_PROBLEMS].filter(
        (p) => p.topics.includes(topic) && solved.has(p.slug),
      ).length;
    if (topicSolved('dynamic programming') >= 5) await earn('dp-warrior', 'DP Warrior');
    if (topicSolved('trees') + topicSolved('graph') >= 5)
      await earn('tree-master', 'Tree Master');
    if (topicSolved('arrays') >= 5) await earn('array-ninja', 'Array Ninja');

    // System design
    const sdSolved = SYSTEM_DESIGN_PROBLEMS.filter((p) => solved.has(p.slug)).length;
    if (sdSolved >= 3) await earn('design-guru', 'Design Guru');

    // Polyglot
    if (languages.size >= 3) await earn('polyglot', 'Polyglot');

    // All topics
    const allCovered = ALL_TOPICS.every((t) => topicSolved(t) > 0);
    if (allCovered) await earn('all-topics', 'Full Stack DSA');

    // Streaks are computed on-the-fly (not in this method) since they need date grouping
  }

  // ---------------------------------------------------------------- Streak calculation

  async getStreak(userId: string): Promise<{ current: number; max: number }> {
    const rows = await this.db.problemProgress.findMany({
      where: { userId, solvedAt: { not: null } },
      select: { solvedAt: true },
      orderBy: { solvedAt: 'desc' },
    });

    if (rows.length === 0) return { current: 0, max: 0 };

    const dates = [...new Set(rows.map((r) => r.solvedAt!.toISOString().slice(0, 10)))].sort(
      (a, b) => b.localeCompare(a),
    );

    let current = 0;
    let max = 0;
    let streak = 1;
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

    // Current streak: must include today or yesterday
    if (dates[0] !== today && dates[0] !== yesterday) {
      current = 0;
    } else {
      current = 1;
      for (let i = 1; i < dates.length; i++) {
        const diff =
          (new Date(dates[i - 1]!).getTime() - new Date(dates[i]!).getTime()) / 86_400_000;
        if (diff === 1) current++;
        else break;
      }
    }

    // Max streak
    streak = 1;
    max = 1;
    for (let i = 1; i < dates.length; i++) {
      const diff =
        (new Date(dates[i - 1]!).getTime() - new Date(dates[i]!).getTime()) / 86_400_000;
      if (diff === 1) {
        streak++;
        max = Math.max(max, streak);
      } else {
        streak = 1;
      }
    }
    max = Math.max(max, streak);

    // Award streak badges
    if (current >= 7) {
      await this.db.userBadge
        .create({ data: { userId, badge: 'streak-7', label: '7-Day Streak' } })
        .catch(() => {});
    }
    if (current >= 30) {
      await this.db.userBadge
        .create({ data: { userId, badge: 'streak-30', label: '30-Day Streak' } })
        .catch(() => {});
    }

    return { current, max };
  }

  // ---------------------------------------------------------------- Public profile (extended)

  async publicProfile(username: string): Promise<PublicProfileDto> {
    const user = await this.db.user.findUnique({
      where: { username: username.toLowerCase() },
      select: {
        ...userSummarySelect,
        bio: true,
        createdAt: true,
        skills: { orderBy: { rating: 'desc' }, select: { name: true, rating: true, updatedAt: true } },
        _count: { select: { questions: true, answers: true, hostedSessions: true } },
        problemProgress: true,
        badges: { orderBy: { earnedAt: 'desc' } },
        cpProfiles: true,
      },
    });
    if (!user) throw new NotFoundError('User');

    const [acceptedAnswers, snippets, topTags, interviewSubmissions] = await Promise.all([
      this.db.answer.count({ where: { authorId: user.id, acceptedOn: { isNot: null } } }),
      this.db.snippet.count({ where: { authorId: user.id, visibility: 'PUBLIC' } }),
      this.db.$queryRaw<{ name: string; count: bigint }[]>`
        SELECT t.name, COUNT(*) AS count
        FROM answers a
        JOIN "_QuestionToTag" qt ON qt."A" = a."questionId"
        JOIN tags t ON t.id = qt."B"
        WHERE a."authorId" = ${user.id}
        GROUP BY t.name ORDER BY count DESC LIMIT 5`,
      this.db.interviewSubmission.findMany({
        where: { userId: user.id },
        select: { passed: true, total: true },
      }),
    ]);

    const solved = user.problemProgress.filter((p) => p.status === 'SOLVED');
    const attempted = user.problemProgress.filter((p) => p.status === 'ATTEMPTED');
    const streak = await this.getStreak(user.id);

    const easySolved = INTERVIEW_PROBLEMS.filter(
      (p) => p.difficulty === 'Easy' && solved.some((s) => s.problemSlug === p.slug),
    ).length;
    const mediumSolved = INTERVIEW_PROBLEMS.filter(
      (p) => p.difficulty === 'Medium' && solved.some((s) => s.problemSlug === p.slug),
    ).length;
    const hardSolved = INTERVIEW_PROBLEMS.filter(
      (p) => p.difficulty === 'Hard' && solved.some((s) => s.problemSlug === p.slug),
    ).length;

    // Topic breakdown
    const solvedSlugs = new Set(solved.map((s) => s.problemSlug));
    const topicBreakdown = ALL_TOPICS.map((topic) => {
      const topicProblems = [...INTERVIEW_PROBLEMS, ...SYSTEM_DESIGN_PROBLEMS].filter((p) =>
        p.topics.includes(topic),
      );
      return {
        topic,
        solved: topicProblems.filter((p) => solvedSlugs.has(p.slug)).length,
        total: topicProblems.length,
      };
    }).filter((t) => t.total > 0);

    // Interview stats
    const totalInterviews = interviewSubmissions.length;
    const totalPassed = interviewSubmissions.reduce((s, r) => s + r.passed, 0);
    const totalTests = interviewSubmissions.reduce((s, r) => s + r.total, 0);

    // Recent solves
    const recentSolves = solved
      .filter((s) => s.solvedAt)
      .sort((a, b) => b.solvedAt!.getTime() - a.solvedAt!.getTime())
      .slice(0, 10)
      .map((s) => {
        const problem =
          INTERVIEW_PROBLEMS.find((p) => p.slug === s.problemSlug) ??
          SYSTEM_DESIGN_PROBLEMS.find((p) => p.slug === s.problemSlug);
        return {
          problemSlug: s.problemSlug,
          problemTitle: problem?.title ?? s.problemSlug,
          difficulty: problem?.difficulty ?? 'Medium',
          solvedAt: s.solvedAt!.toISOString(),
        };
      });

    return {
      ...toUserSummary(user),
      bio: user.bio,
      createdAt: user.createdAt.toISOString(),
      stats: {
        questions: user._count.questions,
        answers: user._count.answers,
        acceptedAnswers,
        snippets,
        sessionsHosted: user._count.hostedSessions,
      },
      topTags: topTags.map((t) => ({ name: t.name, count: Number(t.count) })),
      skills: user.skills.map((s) => ({
        name: s.name,
        rating: s.rating,
        updatedAt: s.updatedAt.toISOString(),
      })),
      problemStats: {
        total: INTERVIEW_PROBLEMS.length + SYSTEM_DESIGN_PROBLEMS.length,
        solved: solved.length,
        attempted: attempted.length,
        easySolved,
        mediumSolved,
        hardSolved,
        streak: streak.current,
        maxStreak: streak.max,
        topicBreakdown,
      },
      badges: user.badges.map(toBadgeDto),
      cpProfiles: user.cpProfiles.map(toCpDto),
      interviewStats: {
        totalInterviews,
        averageScore: totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : null,
        solvedRate: totalInterviews > 0 ? Math.round((solved.length / totalInterviews) * 100) : null,
      },
      recentSolves,
    };
  }
}

// ---------------------------------------------------------------- Mappers

function toProgressDto(r: {
  problemSlug: string;
  status: string;
  attempts: number;
  bestPassed: number;
  bestTotal: number;
  language: string | null;
  solvedAt: Date | null;
}): ProblemProgressDto {
  return {
    problemSlug: r.problemSlug,
    status: r.status as ProblemProgressDto['status'],
    attempts: r.attempts,
    bestPassed: r.bestPassed,
    bestTotal: r.bestTotal,
    language: r.language,
    solvedAt: r.solvedAt?.toISOString() ?? null,
  };
}

function toCpDto(r: {
  platform: string;
  username: string;
  stats: unknown;
  syncedAt: Date | null;
}): CpProfileDto {
  const platform = r.platform as CpPlatform;
  return {
    platform,
    username: r.username,
    profileUrl: (CP_PLATFORM_URLS[platform] ?? '') + r.username,
    stats: (r.stats as Record<string, unknown>) ?? null,
    syncedAt: r.syncedAt?.toISOString() ?? null,
  };
}

function toBadgeDto(r: { badge: string; label: string; earnedAt: Date }): UserBadgeDto {
  const def = BADGE_DEFINITIONS[r.badge];
  return {
    badge: r.badge,
    label: r.label,
    description: def?.description ?? '',
    icon: def?.icon ?? '🏅',
    earnedAt: r.earnedAt.toISOString(),
  };
}
