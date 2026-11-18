import { z } from 'zod';
import {
  cursorQuerySchema,
  markReadSchema,
  skillsUpsertSchema,
  updateProfileSchema,
  usernameSchema,
  type CursorQuery,
} from '@devhub/shared';
import type { Container } from '../../container.js';
import { defineRoute, type RouteContext } from '../../core/route.js';
import { query } from '../../core/validate.js';
import { currentUser } from '../../middleware/auth.js';

export function userRoutes(ctx: RouteContext, c: Container): void {
  defineRoute(ctx, {
    method: 'get',
    path: '/leaderboard',
    tag: 'Users',
    summary: 'Top users by reputation (cached 60 s)',
    query: z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }),
    handler: async (_req, res) => {
      res.json(await c.users.leaderboard(query<{ limit: number }>(res).limit));
    },
  });

  defineRoute(ctx, {
    method: 'get',
    path: '/me/dashboard',
    tag: 'Users',
    summary: 'Personal dashboard: stats, reputation history, activity, suggestions',
    auth: 'required',
    handler: async (req, res) => {
      res.json(await c.users.dashboard(currentUser(req).id));
    },
  });

  defineRoute(ctx, {
    method: 'patch',
    path: '/me',
    tag: 'Users',
    summary: 'Update your profile',
    auth: 'required',
    body: updateProfileSchema,
    handler: async (req, res) => {
      res.json(await c.users.updateProfile(currentUser(req).id, req.body));
    },
  });

  defineRoute(ctx, {
    method: 'get',
    path: '/me/skills',
    tag: 'Users',
    summary: 'Your self-rated skills',
    auth: 'required',
    handler: async (req, res) => {
      res.json(await c.users.skills(currentUser(req).id));
    },
  });

  defineRoute(ctx, {
    method: 'put',
    path: '/me/skills',
    tag: 'Users',
    summary: 'Replace your skill list',
    auth: 'required',
    body: skillsUpsertSchema,
    handler: async (req, res) => {
      res.json(await c.users.replaceSkills(currentUser(req).id, req.body.skills));
    },
  });

  defineRoute(ctx, {
    method: 'get',
    path: '/:username',
    tag: 'Users',
    summary: 'Public profile (never includes the email)',
    params: z.object({ username: usernameSchema }),
    responses: { 200: 'OK', 404: 'Not found' },
    handler: async (req, res) => {
      res.json(await c.users.profile(req.params.username as string));
    },
  });
}

export function notificationRoutes(ctx: RouteContext, c: Container): void {
  defineRoute(ctx, {
    method: 'get',
    path: '/',
    tag: 'Notifications',
    summary: 'Your notifications, newest first, with the unread count',
    auth: 'required',
    query: cursorQuerySchema,
    handler: async (req, res) => {
      res.json(await c.notifications.list(currentUser(req).id, query<CursorQuery>(res)));
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/read',
    tag: 'Notifications',
    summary: 'Mark notifications as read ({ ids } or { all: true })',
    auth: 'required',
    body: markReadSchema,
    handler: async (req, res) => {
      res.json(await c.notifications.markRead(currentUser(req).id, req.body));
    },
  });
}
