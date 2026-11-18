import { z } from 'zod';
import {
  acceptAnswerSchema,
  answerBodySchema,
  createQuestionSchema,
  idParamSchema,
  listQuestionsQuerySchema,
  updateQuestionSchema,
  voteSchema,
  type ListQuestionsQuery,
} from '@devhub/shared';
import type { Container } from '../../container.js';
import { defineRoute, type RouteContext } from '../../core/route.js';
import { query } from '../../core/validate.js';
import { currentUser } from '../../middleware/auth.js';

export function questionRoutes(ctx: RouteContext, c: Container): void {
  defineRoute(ctx, {
    method: 'get',
    path: '/',
    tag: 'Questions',
    summary: 'List questions (full-text search, tag/author filter, sort, pagination)',
    query: listQuestionsQuerySchema,
    handler: async (_req, res) => {
      res.json(await c.questions.list(query<ListQuestionsQuery>(res)));
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/',
    tag: 'Questions',
    summary: 'Ask a question',
    auth: 'required',
    body: createQuestionSchema,
    responses: { 201: 'Created' },
    handler: async (req, res) => {
      res.status(201).json(await c.questions.create(currentUser(req), req.body));
    },
  });

  defineRoute(ctx, {
    method: 'get',
    path: '/:id',
    tag: 'Questions',
    summary:
      'Question with answers and the caller’s votes (counts a view once per hour per viewer)',
    auth: 'optional',
    params: idParamSchema,
    responses: { 200: 'OK', 404: 'Not found' },
    handler: async (req, res) => {
      res.json(await c.questions.getById(req.params.id as string, req.user, req.ip ?? 'unknown'));
    },
  });

  defineRoute(ctx, {
    method: 'patch',
    path: '/:id',
    tag: 'Questions',
    summary: 'Edit a question (author or admin)',
    auth: 'required',
    params: idParamSchema,
    body: updateQuestionSchema,
    responses: { 200: 'Updated', 403: 'Not the author', 404: 'Not found' },
    handler: async (req, res) => {
      res.json(await c.questions.update(currentUser(req), req.params.id as string, req.body));
    },
  });

  defineRoute(ctx, {
    method: 'delete',
    path: '/:id',
    tag: 'Questions',
    summary: 'Delete a question (author or admin)',
    auth: 'required',
    params: idParamSchema,
    responses: { 204: 'Deleted', 403: 'Not the author', 404: 'Not found' },
    handler: async (req, res) => {
      await c.questions.remove(currentUser(req), req.params.id as string);
      res.status(204).end();
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/:id/vote',
    tag: 'Questions',
    summary: 'Vote on a question (1, -1, or 0 to retract); idempotent',
    auth: 'required',
    params: idParamSchema,
    body: voteSchema,
    responses: { 200: 'New score', 403: 'Own post or not enough reputation to downvote' },
    handler: async (req, res) => {
      res.json(
        await c.questions.vote(
          currentUser(req),
          'QUESTION',
          req.params.id as string,
          req.body.value,
        ),
      );
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/:id/answers',
    tag: 'Answers',
    summary: 'Answer a question',
    auth: 'required',
    params: idParamSchema,
    body: answerBodySchema,
    responses: { 201: 'Created', 404: 'Question not found' },
    handler: async (req, res) => {
      res
        .status(201)
        .json(
          await c.questions.addAnswer(currentUser(req), req.params.id as string, req.body.body),
        );
    },
  });

  defineRoute(ctx, {
    method: 'put',
    path: '/:id/accepted-answer',
    tag: 'Answers',
    summary: 'Accept an answer (asker only); null un-accepts',
    auth: 'required',
    params: idParamSchema,
    body: acceptAnswerSchema,
    responses: { 200: 'Accepted answer id', 403: 'Not the asker' },
    handler: async (req, res) => {
      res.json(
        await c.questions.accept(currentUser(req), req.params.id as string, req.body.answerId),
      );
    },
  });
}

export function answerRoutes(ctx: RouteContext, c: Container): void {
  defineRoute(ctx, {
    method: 'patch',
    path: '/:id',
    tag: 'Answers',
    summary: 'Edit an answer (author or admin)',
    auth: 'required',
    params: idParamSchema,
    body: answerBodySchema,
    handler: async (req, res) => {
      res.json(
        await c.questions.updateAnswer(currentUser(req), req.params.id as string, req.body.body),
      );
    },
  });

  defineRoute(ctx, {
    method: 'delete',
    path: '/:id',
    tag: 'Answers',
    summary: 'Delete an answer (author or admin)',
    auth: 'required',
    params: idParamSchema,
    responses: { 204: 'Deleted' },
    handler: async (req, res) => {
      await c.questions.removeAnswer(currentUser(req), req.params.id as string);
      res.status(204).end();
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/:id/vote',
    tag: 'Answers',
    summary: 'Vote on an answer (1, -1, or 0 to retract); idempotent',
    auth: 'required',
    params: idParamSchema,
    body: voteSchema,
    handler: async (req, res) => {
      res.json(
        await c.questions.vote(currentUser(req), 'ANSWER', req.params.id as string, req.body.value),
      );
    },
  });
}

export function tagRoutes(ctx: RouteContext, c: Container): void {
  defineRoute(ctx, {
    method: 'get',
    path: '/',
    tag: 'Tags',
    summary: 'Popular tags with usage counts (prefix search with ?q=)',
    query: z.object({ q: z.string().trim().toLowerCase().max(30).optional() }),
    handler: async (_req, res) => {
      res.json(await c.users.popularTags(query<{ q?: string }>(res).q));
    },
  });
}
