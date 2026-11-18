import { type Prisma } from '@prisma/client';
import {
  authorReputationDelta,
  MIN_REPUTATION_TO_DOWNVOTE,
  REPUTATION,
  voterReputationDelta,
  type AnswerDto,
  type CreateQuestionInput,
  type ListQuestionsQuery,
  type Paginated,
  type QuestionDetailDto,
  type QuestionSummaryDto,
  type UpdateQuestionInput,
  type VoteResultDto,
  type VoteValue,
} from '@devhub/shared';
import type { Db, Tx } from '../../lib/prisma.js';
import type { Cache } from '../../lib/cache.js';
import type { EventBus } from '../../core/events.js';
import type { AuthUser } from '../../middleware/auth.js';
import { ForbiddenError, NotFoundError } from '../../core/errors.js';
import { assertCan, policies } from '../../core/policies.js';
import {
  excerpt,
  pageMeta,
  tagConnect,
  toUserSummary,
  userSummarySelect,
} from '../../core/mappers.js';
import { withRetry } from '../../core/tx.js';
import type { ReputationService } from './reputation.service.js';

const summaryInclude = {
  author: { select: userSummarySelect },
  tags: { select: { name: true } },
} satisfies Prisma.QuestionInclude;

type SummaryRow = Prisma.QuestionGetPayload<{ include: typeof summaryInclude }>;

const toSummary = (q: SummaryRow): QuestionSummaryDto => ({
  id: q.id,
  title: q.title,
  excerpt: excerpt(q.body),
  tags: q.tags.map((t) => t.name).sort(),
  score: q.score,
  answerCount: q.answerCount,
  viewCount: q.viewCount,
  hasAcceptedAnswer: q.acceptedAnswerId !== null,
  author: toUserSummary(q.author),
  createdAt: q.createdAt.toISOString(),
  lastActivityAt: q.lastActivityAt.toISOString(),
});

const ORDER_BY: Record<ListQuestionsQuery['sort'], Prisma.QuestionOrderByWithRelationInput[]> = {
  newest: [{ createdAt: 'desc' }],
  votes: [{ score: 'desc' }, { createdAt: 'desc' }],
  active: [{ lastActivityAt: 'desc' }],
  unanswered: [{ createdAt: 'desc' }],
};

/** Upper bound on full-text candidates before other filters/sorting are applied. */
const SEARCH_CANDIDATES = 500;

export class QuestionsService {
  constructor(
    private readonly db: Db,
    private readonly cache: Cache,
    private readonly events: EventBus,
    private readonly reputation: ReputationService,
  ) {}

  // ---------------------------------------------------------------- reads

  async list(q: ListQuestionsQuery): Promise<Paginated<QuestionSummaryDto>> {
    const where: Prisma.QuestionWhereInput = {};
    if (q.tag) where.tags = { some: { name: q.tag } };
    if (q.author) where.author = { username: q.author.toLowerCase() };
    if (q.sort === 'unanswered') where.answerCount = 0;

    if (q.q) where.id = { in: await this.searchIds(q.q) };

    const [total, rows] = await this.db.$transaction([
      this.db.question.count({ where }),
      this.db.question.findMany({
        where,
        include: summaryInclude,
        orderBy: ORDER_BY[q.sort],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
    ]);
    return { items: rows.map(toSummary), meta: pageMeta(q.page, q.limit, total) };
  }

  /**
   * Postgres full-text search on the trigger-maintained, GIN-indexed tsvector.
   * websearch_to_tsquery accepts user syntax safely ("quoted phrases", -exclusions, or).
   */
  private async searchIds(text: string): Promise<string[]> {
    const rows = await this.db.$queryRaw<{ id: string }[]>`
      SELECT id FROM questions
      WHERE "searchVector" @@ websearch_to_tsquery('english', ${text})
      ORDER BY ts_rank_cd("searchVector", websearch_to_tsquery('english', ${text})) DESC
      LIMIT ${SEARCH_CANDIDATES}`;
    return rows.map((r) => r.id);
  }

  async getById(
    id: string,
    viewer: AuthUser | undefined,
    viewerKey: string,
  ): Promise<QuestionDetailDto> {
    const q = await this.db.question.findUnique({
      where: { id },
      include: {
        ...summaryInclude,
        answers: {
          include: { author: { select: userSummarySelect } },
          orderBy: [{ score: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });
    if (!q) throw new NotFoundError('Question');

    // Count at most one view per viewer per hour (Redis SET NX with TTL).
    let viewCount = q.viewCount;
    if (await this.cache.setIfAbsent(`view:q:${id}:${viewer?.id ?? viewerKey}`, 3_600)) {
      await this.db.question.update({ where: { id }, data: { viewCount: { increment: 1 } } });
      viewCount += 1;
    }

    const myVotes = new Map<string, VoteValue>();
    if (viewer) {
      const votes = await this.db.vote.findMany({
        where: {
          userId: viewer.id,
          OR: [{ questionId: id }, { answerId: { in: q.answers.map((a) => a.id) } }],
        },
        select: { questionId: true, answerId: true, value: true },
      });
      for (const v of votes) myVotes.set((v.questionId ?? v.answerId)!, v.value as VoteValue);
    }

    const answers: AnswerDto[] = q.answers
      .map((a) => ({
        id: a.id,
        body: a.body,
        score: a.score,
        isAccepted: a.id === q.acceptedAnswerId,
        author: toUserSummary(a.author),
        myVote: myVotes.get(a.id) ?? 0,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
      }))
      // Accepted answer pins to the top; the rest keep score order.
      .sort((a, b) => Number(b.isAccepted) - Number(a.isAccepted));

    const { excerpt: _e, ...summary } = toSummary(q);
    return {
      ...summary,
      viewCount,
      body: q.body,
      acceptedAnswerId: q.acceptedAnswerId,
      myVote: myVotes.get(q.id) ?? 0,
      answers,
      updatedAt: q.updatedAt.toISOString(),
    };
  }

  // ---------------------------------------------------------------- writes

  async create(user: AuthUser, input: CreateQuestionInput): Promise<QuestionSummaryDto> {
    const q = await this.db.question.create({
      data: {
        title: input.title,
        body: input.body,
        authorId: user.id,
        tags: { connectOrCreate: tagConnect(input.tags) },
      },
      include: summaryInclude,
    });
    await this.cache.del('tags:popular');
    void this.events.emit('content.changed', { kind: 'question', id: q.id });
    return toSummary(q);
  }

  async update(
    user: AuthUser,
    id: string,
    input: UpdateQuestionInput,
  ): Promise<QuestionSummaryDto> {
    const existing = await this.db.question.findUnique({
      where: { id },
      select: { authorId: true },
    });
    if (!existing) throw new NotFoundError('Question');
    assertCan(
      policies.canModify(user, existing.authorId),
      'Only the author can edit this question',
    );

    const q = await this.db.question.update({
      where: { id },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.body !== undefined && { body: input.body }),
        ...(input.tags !== undefined && {
          tags: { set: [], connectOrCreate: tagConnect(input.tags) },
        }),
        lastActivityAt: new Date(),
      },
      include: summaryInclude,
    });
    void this.events.emit('content.changed', { kind: 'question', id });
    return toSummary(q);
  }

  async remove(user: AuthUser, id: string): Promise<void> {
    const existing = await this.db.question.findUnique({
      where: { id },
      select: { authorId: true },
    });
    if (!existing) throw new NotFoundError('Question');
    assertCan(
      policies.canModify(user, existing.authorId),
      'Only the author can delete this question',
    );
    await this.db.question.delete({ where: { id } });
    void this.events.emit('content.changed', { kind: 'question', id });
  }

  async addAnswer(user: AuthUser, questionId: string, body: string): Promise<AnswerDto> {
    const { answer, question } = await this.db.$transaction(async (tx) => {
      const question = await tx.question
        .update({
          where: { id: questionId },
          data: { answerCount: { increment: 1 }, lastActivityAt: new Date() },
          select: { id: true, title: true, authorId: true },
        })
        .catch(() => null);
      if (!question) throw new NotFoundError('Question');
      const answer = await tx.answer.create({
        data: { body, questionId, authorId: user.id },
        include: { author: { select: userSummarySelect } },
      });
      return { answer, question };
    });

    void this.events.emit('answer.created', {
      answerId: answer.id,
      questionId,
      questionTitle: question.title,
      questionAuthorId: question.authorId,
      actorId: user.id,
    });
    void this.events.emit('content.changed', { kind: 'answer', id: answer.id });
    return {
      id: answer.id,
      body: answer.body,
      score: 0,
      isAccepted: false,
      author: toUserSummary(answer.author),
      myVote: 0,
      createdAt: answer.createdAt.toISOString(),
      updatedAt: answer.updatedAt.toISOString(),
    };
  }

  async updateAnswer(
    user: AuthUser,
    answerId: string,
    body: string,
  ): Promise<{ id: string; body: string; updatedAt: string }> {
    const existing = await this.db.answer.findUnique({
      where: { id: answerId },
      select: { authorId: true, questionId: true },
    });
    if (!existing) throw new NotFoundError('Answer');
    assertCan(policies.canModify(user, existing.authorId), 'Only the author can edit this answer');
    const [a] = await this.db.$transaction([
      this.db.answer.update({ where: { id: answerId }, data: { body } }),
      this.db.question.update({
        where: { id: existing.questionId },
        data: { lastActivityAt: new Date() },
      }),
    ]);
    void this.events.emit('content.changed', { kind: 'answer', id: answerId });
    return { id: a.id, body: a.body, updatedAt: a.updatedAt.toISOString() };
  }

  async removeAnswer(user: AuthUser, answerId: string): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const a = await tx.answer.findUnique({
        where: { id: answerId },
        select: {
          authorId: true,
          questionId: true,
          acceptedOn: { select: { id: true, authorId: true } },
        },
      });
      if (!a) throw new NotFoundError('Answer');
      assertCan(policies.canModify(user, a.authorId), 'Only the author can delete this answer');
      // Deleting an accepted answer takes back the acceptance bonus.
      if (a.acceptedOn && a.acceptedOn.authorId !== a.authorId) {
        await this.reputation.apply(
          tx,
          a.authorId,
          -REPUTATION.ANSWER_ACCEPTED,
          'ANSWER_ACCEPTED',
          answerId,
        );
      }
      await tx.answer.delete({ where: { id: answerId } });
      await tx.question.update({
        where: { id: a.questionId },
        data: { answerCount: { decrement: 1 } },
      });
    });
    void this.events.emit('content.changed', { kind: 'answer', id: answerId });
  }

  /**
   * Accepts (or with null, un-accepts) an answer. Only the asker may do it. Switching the
   * accepted answer moves the +15 from the previous author to the new one atomically.
   * Self-answers can be accepted but earn no reputation.
   */
  async accept(
    user: AuthUser,
    questionId: string,
    answerId: string | null,
  ): Promise<{ acceptedAnswerId: string | null }> {
    const result = await this.db.$transaction(async (tx) => {
      const q = await tx.question.findUnique({
        where: { id: questionId },
        select: {
          id: true,
          title: true,
          authorId: true,
          acceptedAnswer: { select: { id: true, authorId: true } },
        },
      });
      if (!q) throw new NotFoundError('Question');
      assertCan(policies.canAcceptAnswer(user, q.authorId), 'Only the asker can accept an answer');

      let next: { id: string; authorId: string } | null = null;
      if (answerId) {
        next = await tx.answer.findFirst({
          where: { id: answerId, questionId },
          select: { id: true, authorId: true },
        });
        if (!next) throw new NotFoundError('Answer');
      }
      const prev = q.acceptedAnswer;
      if (prev?.id === next?.id)
        return { acceptedAnswerId: prev?.id ?? null, changed: null, title: q.title };

      if (prev && prev.authorId !== q.authorId) {
        await this.reputation.apply(
          tx,
          prev.authorId,
          -REPUTATION.ANSWER_ACCEPTED,
          'ANSWER_ACCEPTED',
          prev.id,
        );
      }
      if (next && next.authorId !== q.authorId) {
        await this.reputation.apply(
          tx,
          next.authorId,
          REPUTATION.ANSWER_ACCEPTED,
          'ANSWER_ACCEPTED',
          next.id,
        );
      }
      await tx.question.update({
        where: { id: questionId },
        data: { acceptedAnswerId: next?.id ?? null, lastActivityAt: new Date() },
      });
      return { acceptedAnswerId: next?.id ?? null, changed: next, title: q.title };
    });

    if (result.changed && result.changed.authorId !== user.id) {
      void this.events.emit('answer.accepted', {
        answerId: result.changed.id,
        questionId,
        questionTitle: result.title,
        answerAuthorId: result.changed.authorId,
        actorId: user.id,
      });
    }
    return { acceptedAnswerId: result.acceptedAnswerId };
  }

  // ---------------------------------------------------------------- voting

  async vote(
    user: AuthUser,
    target: 'QUESTION' | 'ANSWER',
    targetId: string,
    value: VoteValue,
  ): Promise<VoteResultDto> {
    const outcome = await withRetry(() =>
      this.db.$transaction(async (tx) => this.applyVote(tx, user, target, targetId, value)),
    );
    if (outcome.notify) void this.events.emit('content.upvoted', outcome.notify);
    return { score: outcome.score, myVote: value };
  }

  private async applyVote(
    tx: Tx,
    user: AuthUser,
    target: 'QUESTION' | 'ANSWER',
    targetId: string,
    to: VoteValue,
  ) {
    const content =
      target === 'QUESTION'
        ? await tx.question.findUnique({
            where: { id: targetId },
            select: { authorId: true, score: true, id: true, title: true },
          })
        : await tx.answer.findUnique({
            where: { id: targetId },
            select: {
              authorId: true,
              score: true,
              id: true,
              question: { select: { id: true, title: true } },
            },
          });
    if (!content) throw new NotFoundError(target === 'QUESTION' ? 'Question' : 'Answer');
    assertCan(policies.canVoteOn(user, content.authorId), 'You cannot vote on your own post');

    if (to === -1) {
      const voter = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { reputation: true },
      });
      if (voter.reputation < MIN_REPUTATION_TO_DOWNVOTE) {
        throw new ForbiddenError(`Downvoting needs ${MIN_REPUTATION_TO_DOWNVOTE} reputation`);
      }
    }

    const key =
      target === 'QUESTION'
        ? { userId_questionId: { userId: user.id, questionId: targetId } }
        : { userId_answerId: { userId: user.id, answerId: targetId } };
    const existing = await tx.vote.findUnique({ where: key, select: { id: true, value: true } });
    const from = (existing?.value ?? 0) as VoteValue;
    if (from === to) return { score: content.score, notify: null };

    if (to === 0) await tx.vote.delete({ where: { id: existing!.id } });
    else if (existing) await tx.vote.update({ where: { id: existing.id }, data: { value: to } });
    else
      await tx.vote.create({
        data: {
          userId: user.id,
          target,
          value: to,
          ...(target === 'QUESTION' ? { questionId: targetId } : { answerId: targetId }),
        },
      });

    const delta = to - from;
    const updated =
      target === 'QUESTION'
        ? await tx.question.update({
            where: { id: targetId },
            data: { score: { increment: delta } },
            select: { score: true },
          })
        : await tx.answer.update({
            where: { id: targetId },
            data: { score: { increment: delta } },
            select: { score: true },
          });

    const reason = target === 'QUESTION' ? 'QUESTION_VOTE' : 'ANSWER_VOTE';
    await this.reputation.apply(
      tx,
      content.authorId,
      authorReputationDelta(target, from, to),
      reason,
      targetId,
    );
    await this.reputation.apply(
      tx,
      user.id,
      voterReputationDelta(target, from, to),
      'DOWNVOTE_CAST',
      targetId,
    );

    const question =
      'question' in content ? content.question : { id: content.id, title: content.title };
    const notify =
      to === 1 && from !== 1
        ? {
            target,
            questionId: question.id,
            ...(target === 'ANSWER' && { answerId: targetId }),
            title: question.title,
            authorId: content.authorId,
            actorId: user.id,
          }
        : null;
    return { score: updated.score, notify };
  }
}
