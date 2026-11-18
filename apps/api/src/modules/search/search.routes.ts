import { z } from 'zod';
import { searchQuerySchema, similarQuestionsQuerySchema } from '@devhub/shared';
import type { Container } from '../../container.js';
import { defineRoute, type RouteContext } from '../../core/route.js';
import { query } from '../../core/validate.js';

export function searchRoutes(ctx: RouteContext, c: Container): void {
  defineRoute(ctx, {
    method: 'get',
    path: '/',
    tag: 'Search',
    summary: 'Hybrid search: full-text and semantic (pgvector) results fused with RRF',
    query: searchQuerySchema,
    handler: async (_req, res) => {
      const { q, limit } = query<z.infer<typeof searchQuerySchema>>(res);
      res.json(await c.search.hybrid(q, limit));
    },
  });

  defineRoute(ctx, {
    method: 'get',
    path: '/similar-questions',
    tag: 'Search',
    summary: 'Existing questions similar to a draft title (duplicate detection)',
    query: similarQuestionsQuerySchema,
    handler: async (_req, res) => {
      const { text, excludeId } = query<z.infer<typeof similarQuestionsQuerySchema>>(res);
      res.json(await c.search.similarQuestions(text, excludeId));
    },
  });

  defineRoute(ctx, {
    method: 'get',
    path: '/related/:questionId',
    tag: 'Search',
    summary: 'Questions semantically related to a question',
    params: z.object({ questionId: z.string().min(1).max(40) }),
    handler: async (req, res) => {
      res.json(await c.search.related(req.params.questionId as string));
    },
  });
}
