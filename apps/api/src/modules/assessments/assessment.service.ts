import crypto from 'node:crypto';
import type {
  AssessmentDto,
  AssessmentSectionDto,
  CandidateInviteDto,
  CandidateReportDto,
  CandidateStatus,
  AssessmentAnalyticsDto,
  OrgRole,
  CreateAssessmentInput,
} from '@devhub/shared';
import type { Db } from '../../lib/prisma.js';
import type { Cache } from '../../lib/cache.js';
import type { Logger } from '../../lib/logger.js';
import { ConflictError, ForbiddenError, NotFoundError, RateLimitError } from '../../core/errors.js';
import type { OrgService } from './org.service.js';

const toDto = (a: any, orgName: string): AssessmentDto => ({
  id: a.id,
  title: a.title,
  description: a.description,
  orgId: a.orgId,
  orgName,
  sections: a.sections as AssessmentSectionDto[],
  totalDurationMinutes: a.totalDurationMinutes,
  allowedLanguages: a.allowedLanguages as any,
  proctoring: a.proctoringConfig as any,
  passingScore: a.passingScore,
  instructions: a.instructions,
  shuffleQuestions: a.shuffleQuestions,
  showScoreToCandidate: a.showScoreToCandidate,
  status: a.status,
  candidateCount: a._count?.invites ?? 0,
  createdAt: a.createdAt.toISOString(),
  updatedAt: a.updatedAt.toISOString(),
});

const inviteDto = (i: any): CandidateInviteDto => ({
  id: i.id,
  assessmentId: i.assessmentId,
  assessmentTitle: i.assessment?.title ?? '',
  email: i.email,
  name: i.name,
  token: i.token,
  status: i.status as CandidateStatus,
  startedAt: i.startedAt?.toISOString() ?? null,
  submittedAt: i.submittedAt?.toISOString() ?? null,
  expiresAt: i.expiresAt.toISOString(),
  score: i.score ?? null,
  maxScore: i.maxScore ?? null,
  percentile: null,
  createdAt: i.createdAt.toISOString(),
});

export class AssessmentService {
  constructor(
    private readonly db: Db,
    private readonly orgs: OrgService,
    private readonly cache: Cache,
    private readonly logger: Logger,
  ) {}

  async create(userId: string, input: CreateAssessmentInput): Promise<AssessmentDto> {
    await this.orgs.requireRole(userId, input.orgId, ['OWNER', 'ADMIN', 'INTERVIEWER']);
    const org = await this.db.organization.findUnique({ where: { id: input.orgId } });
    if (!org) throw new NotFoundError('Organization');

    const assessment = await this.db.assessment.create({
      data: {
        orgId: input.orgId,
        title: input.title,
        description: input.description,
        sections: input.sections as any,
        totalDurationMinutes: input.totalDurationMinutes,
        allowedLanguages: input.allowedLanguages,
        proctoringConfig: input.proctoring as any,
        passingScore: input.passingScore,
        instructions: input.instructions,
        shuffleQuestions: input.shuffleQuestions,
        showScoreToCandidate: input.showScoreToCandidate,
        createdById: userId,
        status: 'DRAFT',
      },
      include: { _count: { select: { invites: true } } },
    });

    return toDto(assessment, org.name);
  }

  async list(userId: string, orgId: string) {
    await this.orgs.requireRole(userId, orgId, ['OWNER', 'ADMIN', 'INTERVIEWER', 'VIEWER']);
    const org = await this.db.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundError('Organization');

    const assessments = await this.db.assessment.findMany({
      where: { orgId },
      include: { _count: { select: { invites: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return assessments.map((a) => toDto(a, org.name));
  }

  async get(userId: string, assessmentId: string): Promise<AssessmentDto> {
    const assessment = await this.db.assessment.findUnique({
      where: { id: assessmentId },
      include: { org: true, _count: { select: { invites: true } } },
    });
    if (!assessment) throw new NotFoundError('Assessment');
    await this.orgs.requireRole(userId, assessment.orgId, ['OWNER', 'ADMIN', 'INTERVIEWER', 'VIEWER']);

    return toDto(assessment, assessment.org.name);
  }

  async activate(userId: string, assessmentId: string) {
    const assessment = await this.db.assessment.findUnique({ where: { id: assessmentId } });
    if (!assessment) throw new NotFoundError('Assessment');
    await this.orgs.requireRole(userId, assessment.orgId, ['OWNER', 'ADMIN']);

    return this.db.assessment.update({
      where: { id: assessmentId },
      data: { status: 'ACTIVE' },
    });
  }

  async archive(userId: string, assessmentId: string) {
    const assessment = await this.db.assessment.findUnique({ where: { id: assessmentId } });
    if (!assessment) throw new NotFoundError('Assessment');
    await this.orgs.requireRole(userId, assessment.orgId, ['OWNER', 'ADMIN']);

    return this.db.assessment.update({
      where: { id: assessmentId },
      data: { status: 'ARCHIVED' },
    });
  }

  // ---------------------------------------------------------------- Candidate invites

  async inviteCandidates(
    userId: string,
    assessmentId: string,
    candidates: { email: string; name?: string }[],
    expiresInHours: number,
  ): Promise<CandidateInviteDto[]> {
    const assessment = await this.db.assessment.findUnique({
      where: { id: assessmentId },
      include: { org: true },
    });
    if (!assessment) throw new NotFoundError('Assessment');
    if (assessment.status !== 'ACTIVE') throw new ConflictError('Assessment must be active to invite candidates');
    await this.orgs.requireRole(userId, assessment.orgId, ['OWNER', 'ADMIN', 'INTERVIEWER']);

    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    const invites = await this.db.$transaction(
      candidates.map((c) =>
        this.db.candidateInvite.create({
          data: {
            assessmentId,
            email: c.email.toLowerCase(),
            name: c.name ?? null,
            token: crypto.randomBytes(24).toString('base64url'),
            expiresAt,
          },
          include: { assessment: { select: { title: true } } },
        }),
      ),
    );

    return invites.map(inviteDto);
  }

  async listCandidates(userId: string, assessmentId: string): Promise<CandidateInviteDto[]> {
    const assessment = await this.db.assessment.findUnique({ where: { id: assessmentId } });
    if (!assessment) throw new NotFoundError('Assessment');
    await this.orgs.requireRole(userId, assessment.orgId, ['OWNER', 'ADMIN', 'INTERVIEWER', 'VIEWER']);

    const invites = await this.db.candidateInvite.findMany({
      where: { assessmentId },
      include: { assessment: { select: { title: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return invites.map(inviteDto);
  }

  async getByToken(token: string) {
    const invite = await this.db.candidateInvite.findUnique({
      where: { token },
      include: {
        assessment: {
          include: { org: { select: { name: true, logoUrl: true } } },
        },
      },
    });
    if (!invite) throw new NotFoundError('Assessment invite');
    if (invite.expiresAt < new Date() && invite.status === 'INVITED') {
      await this.db.candidateInvite.update({ where: { id: invite.id }, data: { status: 'EXPIRED' } });
      throw new ConflictError('This assessment link has expired');
    }
    if (invite.status === 'EXPIRED') throw new ConflictError('This assessment link has expired');
    if (invite.status === 'SUBMITTED' || invite.status === 'EVALUATED') {
      throw new ConflictError('This assessment has already been submitted');
    }

    return {
      invite: inviteDto(invite),
      assessment: {
        title: invite.assessment.title,
        description: invite.assessment.description,
        totalDurationMinutes: invite.assessment.totalDurationMinutes,
        instructions: invite.assessment.instructions,
        sections: (invite.assessment.sections as any[]).map((s: any) => ({
          ...s,
          mcqQuestions: s.mcqQuestions?.map((q: any) => ({
            ...q,
            options: q.options.map((o: any) => ({ id: o.id, text: o.text })),
          })),
        })),
        allowedLanguages: invite.assessment.allowedLanguages,
        proctoring: invite.assessment.proctoringConfig,
        orgName: invite.assessment.org.name,
        orgLogo: invite.assessment.org.logoUrl,
      },
    };
  }

  async startAssessment(token: string) {
    const invite = await this.db.candidateInvite.findUnique({
      where: { token },
      include: { assessment: true },
    });
    if (!invite) throw new NotFoundError('Assessment invite');
    if (invite.expiresAt < new Date()) throw new ConflictError('This assessment link has expired');
    if (invite.status === 'SUBMITTED' || invite.status === 'EVALUATED') {
      throw new ConflictError('Already submitted');
    }

    const now = new Date();

    if (invite.status === 'INVITED') {
      const updated = await this.db.candidateInvite.updateMany({
        where: { id: invite.id, status: 'INVITED' },
        data: { status: 'IN_PROGRESS', startedAt: now },
      });
      if (updated.count === 0) {
        const fresh = await this.db.candidateInvite.findUnique({
          where: { id: invite.id },
          include: { assessment: true },
        });
        if (!fresh) throw new NotFoundError('Assessment invite');
        return {
          startedAt: fresh.startedAt!.toISOString(),
          endsAt: new Date(
            fresh.startedAt!.getTime() + fresh.assessment.totalDurationMinutes * 60 * 1000,
          ).toISOString(),
        };
      }
    }

    const startedAt = invite.startedAt ?? now;
    return {
      startedAt: startedAt.toISOString(),
      endsAt: new Date(
        startedAt.getTime() + invite.assessment.totalDurationMinutes * 60 * 1000,
      ).toISOString(),
    };
  }

  async submitAssessment(
    token: string,
    results: {
      sectionResults: any[];
    },
  ) {
    const invite = await this.db.candidateInvite.findUnique({
      where: { token },
      include: { assessment: true },
    });
    if (!invite) throw new NotFoundError('Assessment invite');
    if (invite.status === 'SUBMITTED' || invite.status === 'EVALUATED') {
      throw new ConflictError('Already submitted');
    }

    const { score, maxScore } = this.calculateScore(
      invite.assessment.sections as any[],
      results.sectionResults,
    );

    await this.db.candidateInvite.update({
      where: { id: invite.id },
      data: {
        status: 'SUBMITTED',
        submittedAt: new Date(),
        results: results as any,
        score,
        maxScore,
      },
    });

    return { score, maxScore, percentage: maxScore > 0 ? Math.round((score / maxScore) * 100) : 0 };
  }

  private calculateScore(sections: any[], sectionResults: any[]): { score: number; maxScore: number } {
    let totalScore = 0;
    let totalMax = 0;

    for (let sIdx = 0; sIdx < sections.length; sIdx++) {
      const section = sections[sIdx];
      const result = sectionResults.find((r: any) => r.sectionIndex === sIdx);
      if (!result) continue;

      if (section.type === 'MCQ' && section.mcqQuestions) {
        for (let qIdx = 0; qIdx < section.mcqQuestions.length; qIdx++) {
          const q = section.mcqQuestions[qIdx];
          totalMax += q.points || 1;
          const response = result.mcqResponses?.find((r: any) => r.questionIndex === qIdx);
          if (response && typeof response.selectedOption === 'number') {
            const opt = q.options[response.selectedOption];
            if (opt?.isCorrect) totalScore += q.points || 1;
          }
        }
      }

      if (section.type === 'CODING') {
        for (const sol of result.codingSolutions || []) {
          const maxPoints = 10;
          totalMax += maxPoints;
          if (sol.testsTotal > 0) {
            totalScore += Math.round((sol.testsPassed / sol.testsTotal) * maxPoints);
          }
        }
      }
    }

    return { score: totalScore, maxScore: totalMax };
  }

  // ---------------------------------------------------------------- Report & Analytics

  async getCandidateReport(userId: string, inviteId: string): Promise<CandidateReportDto> {
    const invite = await this.db.candidateInvite.findUnique({
      where: { id: inviteId },
      include: {
        assessment: { include: { org: { select: { name: true } } } },
      },
    });
    if (!invite) throw new NotFoundError('Candidate invite');
    await this.orgs.requireRole(userId, invite.assessment.orgId, ['OWNER', 'ADMIN', 'INTERVIEWER', 'VIEWER']);

    if (!invite.results) throw new ConflictError('Assessment not yet submitted');

    const results = invite.results as any;
    const sections = invite.assessment.sections as any[];
    const { score, maxScore } = this.calculateScore(sections, results.sectionResults || []);
    const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

    let proctoringViolations = 0;
    let proctoringEvents: any[] = [];
    if (invite.sessionId) {
      const events = await this.db.proctoringEvent.findMany({
        where: { sessionId: invite.sessionId },
        orderBy: { createdAt: 'asc' },
      });
      proctoringViolations = events.filter((e) => e.type !== 'CAMERA_SNAPSHOT').length;
      proctoringEvents = events
        .filter((e) => e.type !== 'CAMERA_SNAPSHOT')
        .map((e) => ({
          type: e.type,
          detail: e.detail,
          createdAt: e.createdAt.toISOString(),
        }));
    }

    return {
      invite: inviteDto(invite),
      assessment: {
        title: invite.assessment.title,
        orgName: invite.assessment.org.name,
        totalDurationMinutes: invite.assessment.totalDurationMinutes,
        passingScore: invite.assessment.passingScore,
      },
      sectionResults: results.sectionResults || [],
      totalScore: score,
      maxTotalScore: maxScore,
      percentage,
      passed: percentage >= invite.assessment.passingScore,
      timeSpentMinutes: invite.startedAt && invite.submittedAt
        ? Math.round((invite.submittedAt.getTime() - invite.startedAt.getTime()) / 60000)
        : 0,
      proctoringViolations,
      proctoringEvents,
      codeQualityScore: null,
      aiFeedback: invite.aiFeedback,
      startedAt: invite.startedAt?.toISOString() ?? '',
      submittedAt: invite.submittedAt?.toISOString() ?? '',
    };
  }

  async getAnalytics(userId: string, assessmentId: string): Promise<AssessmentAnalyticsDto> {
    const assessment = await this.db.assessment.findUnique({
      where: { id: assessmentId },
      include: { org: true },
    });
    if (!assessment) throw new NotFoundError('Assessment');
    await this.orgs.requireRole(userId, assessment.orgId, ['OWNER', 'ADMIN', 'INTERVIEWER', 'VIEWER']);

    const invites = await this.db.candidateInvite.findMany({
      where: { assessmentId },
      orderBy: { score: 'desc' },
    });

    const statusBreakdown: Record<CandidateStatus, number> = {
      INVITED: 0, STARTED: 0, IN_PROGRESS: 0, SUBMITTED: 0, EVALUATED: 0, EXPIRED: 0,
    };
    const scores: number[] = [];
    const times: number[] = [];

    for (const inv of invites) {
      statusBreakdown[inv.status as CandidateStatus] = (statusBreakdown[inv.status as CandidateStatus] || 0) + 1;
      if (inv.score !== null && inv.maxScore !== null && inv.maxScore > 0) {
        scores.push(Math.round((inv.score / inv.maxScore) * 100));
      }
      if (inv.startedAt && inv.submittedAt) {
        times.push(Math.round((inv.submittedAt.getTime() - inv.startedAt.getTime()) / 60000));
      }
    }

    scores.sort((a, b) => a - b);
    const avg = scores.length > 0 ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : null;
    const median = scores.length > 0 ? scores[Math.floor(scores.length / 2)] ?? null : null;
    const passRate =
      scores.length > 0
        ? Math.round((scores.filter((s) => s >= assessment.passingScore).length / scores.length) * 100)
        : null;
    const avgTime = times.length > 0 ? Math.round(times.reduce((s, v) => s + v, 0) / times.length) : null;

    const ranges = ['0-20', '21-40', '41-60', '61-80', '81-100'];
    const scoreDistribution = ranges.map((range) => {
      const [lo, hi] = range.split('-').map(Number);
      return { range, count: scores.filter((s) => s >= lo! && s <= hi!).length };
    });

    const topCandidates = invites
      .filter((i) => i.score !== null && i.maxScore !== null)
      .slice(0, 10)
      .map((i) => ({
        name: i.name,
        email: i.email,
        score: i.score!,
        maxScore: i.maxScore!,
        percentage: i.maxScore! > 0 ? Math.round((i.score! / i.maxScore!) * 100) : 0,
        timeMinutes:
          i.startedAt && i.submittedAt
            ? Math.round((i.submittedAt.getTime() - i.startedAt.getTime()) / 60000)
            : 0,
      }));

    return {
      assessmentId,
      title: assessment.title,
      totalCandidates: invites.length,
      statusBreakdown,
      averageScore: avg,
      medianScore: median,
      passRate,
      averageTimeMinutes: avgTime,
      scoreDistribution,
      topCandidates,
      problemWiseStats: [],
    };
  }
}
