import { createReportSchema, resolveReportsSchema } from '@devhub/shared';
import type { Container } from '../../container.js';
import { defineRoute, type RouteContext } from '../../core/route.js';
import { currentUser } from '../../middleware/auth.js';

export function reportRoutes(ctx: RouteContext, c: Container): void {
  defineRoute(ctx, {
    method: 'post',
    path: '/',
    tag: 'Moderation',
    summary: 'Report a question, answer or snippet (one report per user per item)',
    auth: 'required',
    body: createReportSchema,
    responses: {
      201: 'Reported; AI triage runs in the background',
      409: 'Already reported',
      429: 'Too many reports',
    },
    handler: async (req, res) => {
      res.status(201).json(await c.moderation.report(currentUser(req), req.body));
    },
  });
}

export function adminRoutes(ctx: RouteContext, c: Container): void {
  defineRoute(ctx, {
    method: 'get',
    path: '/moderation',
    tag: 'Moderation',
    summary: 'Open reports grouped by item, most urgent first (AI verdict, report count, age)',
    auth: 'admin',
    handler: async (_req, res) => {
      res.json(await c.moderation.queueItems());
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/moderation/resolve',
    tag: 'Moderation',
    summary: 'Dismiss the reports or remove the content; applies to every open report for the item',
    auth: 'admin',
    body: resolveReportsSchema,
    handler: async (req, res) => {
      res.json(await c.moderation.resolve(currentUser(req), req.body));
    },
  });
}
