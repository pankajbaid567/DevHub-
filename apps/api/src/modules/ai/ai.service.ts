import { z, type ZodType } from 'zod';
import { ErrorCode } from '@devhub/shared';
import {
  aiInterviewFeedbackSchema,
  type AiInterviewFeedback,
  type TranscriptEntry,
  moderationTriageSchema,
  type ModerationTriage,
  resumeReviewResultSchema,
  skillAssessmentResultSchema,
  type AiResultEnvelope,
  type CitationDto,
  type CodeAssistInput,
  type ConversationDto,
  type ConversationSummaryDto,
  type MentorMessageInput,
  type MentorStreamEvent,
  type MentorTopic,
  type ResumeReviewDto,
  type ResumeReviewResult,
  type SkillAssessmentResult,
} from '@devhub/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Db } from '../../lib/prisma.js';
import type { Logger } from '../../lib/logger.js';
import type { MetricsRegistry } from '../../lib/metrics.js';
import { AppError, NotFoundError } from '../../core/errors.js';
import { AIUnavailableError, type AIProvider, type ChatTurn } from './providers/provider.js';
import {
  CODE_EXPLAIN_PROMPT,
  groundingBlock,
  CODE_REVIEW_PROMPT,
  mentorSystemPrompt,
  INTERVIEW_FEEDBACK_PROMPT,
  MODERATION_PROMPT,
  RESUME_PROMPT,
  SKILLS_PROMPT,
  TITLE_PROMPT,
} from './prompts.js';

/** How much conversation history is sent back to the model for context. */
const HISTORY_TURNS = 20;

const aiError = (err: unknown) =>
  err instanceof AIUnavailableError || err instanceof AppError
    ? new AppError(
        503,
        ErrorCode.AI_UNAVAILABLE,
        'The AI service is temporarily unavailable. Please try again shortly.',
      )
    : err;

export class AiService {
  constructor(
    private readonly db: Db,
    private readonly provider: AIProvider,
    private readonly logger: Logger,
    private readonly metrics: MetricsRegistry,
    /** Retrieval for grounded mentor replies (RAG). */
    private readonly retrieve: (text: string) => Promise<CitationDto[]> = async () => [],
  ) {}

  get isDemo(): boolean {
    return this.provider.isDemo;
  }

  // ---------------------------------------------------------------- mentor conversations

  async createConversation(userId: string, topic: MentorTopic): Promise<ConversationSummaryDto> {
    const c = await this.db.mentorConversation.create({ data: { userId, topic } });
    return {
      id: c.id,
      topic: c.topic as MentorTopic,
      title: c.title,
      messageCount: 0,
      updatedAt: c.updatedAt.toISOString(),
    };
  }

  async listConversations(userId: string): Promise<ConversationSummaryDto[]> {
    const rows = await this.db.mentorConversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: { _count: { select: { messages: true } } },
    });
    return rows.map((c) => ({
      id: c.id,
      topic: c.topic as MentorTopic,
      title: c.title,
      messageCount: c._count.messages,
      updatedAt: c.updatedAt.toISOString(),
    }));
  }

  async getConversation(userId: string, id: string): Promise<ConversationDto> {
    const c = await this.db.mentorConversation.findFirst({
      where: { id, userId },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!c) throw new NotFoundError('Conversation');
    return {
      id: c.id,
      topic: c.topic as MentorTopic,
      title: c.title,
      messageCount: c.messages.length,
      updatedAt: c.updatedAt.toISOString(),
      messages: c.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        model: m.model,
        sources: (m.sources as unknown as CitationDto[] | null) ?? [],
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  async deleteConversation(userId: string, id: string): Promise<void> {
    const { count } = await this.db.mentorConversation.deleteMany({ where: { id, userId } });
    if (!count) throw new NotFoundError('Conversation');
  }

  /**
   * Streams the mentor's reply as events. The user's message is stored first; the assistant
   * message is stored once the stream completes (or with what arrived if the client leaves).
   */
  async *streamReply(
    userId: string,
    conversationId: string,
    input: MentorMessageInput,
    signal: AbortSignal,
  ): AsyncGenerator<MentorStreamEvent> {
    const convo = await this.db.mentorConversation.findFirst({
      where: { id: conversationId, userId },
      include: { messages: { orderBy: { createdAt: 'desc' }, take: HISTORY_TURNS } },
    });
    if (!convo) throw new NotFoundError('Conversation');

    const content = input.code
      ? `${input.content}\n\n\`\`\`\n${input.code}\n\`\`\``
      : input.content;
    const isFirst = convo.messages.length === 0;
    await this.db.mentorMessage.create({ data: { conversationId, role: 'user', content } });

    const turns: ChatTurn[] = [
      ...convo.messages.reverse().map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content },
    ];

    // Retrieval is best-effort: if the index or embedding API fails, answer ungrounded.
    let sources: CitationDto[] = [];
    if (input.useCommunity !== false) {
      sources = await this.retrieve(input.content).catch((err: unknown) => {
        this.logger.warn({ err: (err as Error).message }, 'mentor retrieval failed');
        return [];
      });
    }

    let text = '';
    try {
      const stream = await this.provider.stream({
        system: mentorSystemPrompt(convo.topic as MentorTopic) + groundingBlock(sources),
        turns,
        signal,
      });
      const model = stream.model;
      const placeholder = await this.db.mentorMessage.create({
        data: {
          conversationId,
          role: 'assistant',
          content: '',
          model,
          ...(sources.length && { sources: sources as unknown as Prisma.InputJsonValue }),
        },
      });
      yield { type: 'start', messageId: placeholder.id, model };
      if (sources.length) yield { type: 'sources', sources };
      for await (const chunk of stream.chunks) {
        if (signal.aborted) break;
        text += chunk;
        yield { type: 'delta', text: chunk };
      }
      await this.db.mentorMessage.update({
        where: { id: placeholder.id },
        data: { content: text || '_(no response)_' },
      });

      let title: string | undefined;
      if (isFirst) title = await this.generateTitle(input.content).catch(() => undefined);
      await this.db.mentorConversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date(), ...(title && { title }) },
      });
      this.metrics.aiRequests.inc({ op: 'mentor', outcome: 'ok' });
      yield { type: 'done', messageId: placeholder.id, ...(title && { title }) };
    } catch (err) {
      this.metrics.aiRequests.inc({ op: 'mentor', outcome: 'error' });
      this.logger.error({ err, conversationId }, 'mentor stream failed');
      yield {
        type: 'error',
        code: ErrorCode.AI_UNAVAILABLE,
        message: 'The AI service is temporarily unavailable. Please try again.',
      };
    }
  }

  private async generateTitle(firstMessage: string): Promise<string> {
    if (this.provider.isDemo) return firstMessage.split(/\s+/).slice(0, 6).join(' ').slice(0, 60);
    const { text } = await this.provider.generate({
      system: TITLE_PROMPT,
      turns: [{ role: 'user', content: firstMessage.slice(0, 2_000) }],
      temperature: 0.2,
      maxOutputTokens: 20,
    });
    return (
      text
        .replace(/["'\n]/g, '')
        .trim()
        .slice(0, 60) || 'New conversation'
    );
  }

  // ---------------------------------------------------------------- one-shot tools

  async codeAssist(input: CodeAssistInput): Promise<AiResultEnvelope<{ markdown: string }>> {
    const system = input.mode === 'review' ? CODE_REVIEW_PROMPT : CODE_EXPLAIN_PROMPT;
    const lang = input.language ?? '';
    try {
      const { text, model } = await this.provider.generate({
        system,
        turns: [{ role: 'user', content: `\`\`\`${lang}\n${input.code}\n\`\`\`` }],
      });
      this.metrics.aiRequests.inc({ op: `code-${input.mode}`, outcome: 'ok' });
      return { result: { markdown: text }, model, isDemo: this.provider.isDemo };
    } catch (err) {
      this.metrics.aiRequests.inc({ op: `code-${input.mode}`, outcome: 'error' });
      throw aiError(err);
    }
  }

  async reviewResume(
    userId: string,
    text: string,
    opts: { fileName?: string; targetRole?: string },
  ): Promise<ResumeReviewDto> {
    const role = opts.targetRole ? `Target role: ${opts.targetRole}\n\n` : '';
    const { result, model } = await this.structured(
      RESUME_PROMPT,
      `${role}Resume:\n${text.slice(0, 30_000)}`,
      resumeReviewResultSchema,
      'resume',
    );
    const row = await this.db.resumeReview.create({
      data: {
        userId,
        fileName: opts.fileName ?? null,
        targetRole: opts.targetRole ?? null,
        result: result as unknown as Prisma.InputJsonValue,
        model,
      },
    });
    return {
      id: row.id,
      fileName: row.fileName,
      targetRole: row.targetRole,
      result,
      model,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async listResumeReviews(userId: string): Promise<ResumeReviewDto[]> {
    const rows = await this.db.resumeReview.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return rows.map((r) => ({
      id: r.id,
      fileName: r.fileName,
      targetRole: r.targetRole,
      result: r.result as unknown as ResumeReviewResult,
      model: r.model,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async assessSkills(
    skills: { name: string; rating: number }[],
    goal?: string,
  ): Promise<AiResultEnvelope<SkillAssessmentResult>> {
    const list = skills.map((s) => `- ${s.name}: ${s.rating}/10`).join('\n');
    const { result, model } = await this.structured(
      SKILLS_PROMPT,
      `Skills:\n${list}${goal ? `\n\nGoal: ${goal}` : ''}`,
      skillAssessmentResultSchema,
      'skills',
    );
    return { result, model, isDemo: this.provider.isDemo };
  }

  /**
   * Asks for JSON constrained by a JSON Schema derived from the zod schema, then validates
   * the response with the same zod schema. One retry on malformed output; never stores or
   * returns unvalidated model output.
   */
  /** Classifies reported content for the moderation queue (validated structured output). */
  async triageContent(text: string): Promise<ModerationTriage & { model: string }> {
    const { result, model } = await this.structured(
      MODERATION_PROMPT,
      text.slice(0, 6_000),
      moderationTriageSchema,
      'moderation-triage',
    );
    return { ...result, model };
  }

  /** Scores a practice interview from its transcript and final code (validated structured output). */
  async interviewFeedback(input: {
    problem: { title: string; statement: string };
    transcript: TranscriptEntry[];
    code: string;
  }): Promise<AiInterviewFeedback & { model: string }> {
    // Keep the most recent part if a long interview exceeds the budget.
    const lines = input.transcript.map((t) => `${t.role}: ${t.text}`).join('\n');
    const content = [
      `# Problem: ${input.problem.title}`,
      input.problem.statement.slice(0, 4_000),
      '# Transcript',
      lines.length > 24_000 ? `[…earlier turns omitted]\n${lines.slice(-24_000)}` : lines,
      '# Final code',
      input.code.slice(0, 12_000) || '(no code written)',
    ].join('\n\n');
    const { result, model } = await this.structured(
      INTERVIEW_FEEDBACK_PROMPT,
      content,
      aiInterviewFeedbackSchema,
      'interview-feedback',
    );
    return { ...result, model };
  }

  private async structured<T>(
    system: string,
    content: string,
    schema: ZodType<T>,
    op: string,
  ): Promise<{ result: T; model: string }> {
    const jsonSchema = z.toJSONSchema(schema, { target: 'openapi-3.0' }) as Record<string, unknown>;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const { text, model } = await this.provider.generate({
          system,
          turns: [{ role: 'user', content }],
          jsonSchema,
          temperature: 0.2,
        });
        const parsed = schema.safeParse(JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')));
        if (parsed.success) {
          this.metrics.aiRequests.inc({ op, outcome: 'ok' });
          return { result: parsed.data, model };
        }
        lastErr = parsed.error;
        this.logger.warn(
          { op, attempt, issues: parsed.error.issues.slice(0, 3) },
          'AI returned JSON that failed validation',
        );
      } catch (err) {
        lastErr = err;
        if (err instanceof AIUnavailableError) break;
      }
    }
    this.metrics.aiRequests.inc({ op, outcome: 'error' });
    this.logger.error({ err: lastErr, op }, 'structured AI call failed');
    throw new AppError(
      503,
      ErrorCode.AI_UNAVAILABLE,
      'The AI service could not produce a valid result. Please try again.',
    );
  }
}
