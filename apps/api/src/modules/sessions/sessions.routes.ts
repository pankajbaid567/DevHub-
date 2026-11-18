import {
  createSessionSchema,
  cursorQuerySchema,
  idParamSchema,
  joinSessionSchema,
  listSessionsQuerySchema,
  sendMessageSchema,
  type CursorQuery,
  type ListSessionsQuery,
} from '@devhub/shared';
import type { Container } from '../../container.js';
import { defineRoute, type RouteContext } from '../../core/route.js';
import { query } from '../../core/validate.js';
import { currentUser } from '../../middleware/auth.js';
import type { SessionBroadcaster } from '../../realtime/socket.js';

export function sessionRoutes(
  ctx: RouteContext,
  c: Container,
  broadcast: SessionBroadcaster,
): void {
  defineRoute(ctx, {
    method: 'get',
    path: '/',
    tag: 'Sessions',
    summary: 'List live/scheduled public sessions, or ?scope=mine for yours',
    auth: 'optional',
    query: listSessionsQuerySchema,
    handler: async (req, res) => {
      res.json(await c.sessions.list(query<ListSessionsQuery>(res), req.user));
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/',
    tag: 'Sessions',
    summary: 'Create a session (starts now unless scheduledFor is given)',
    auth: 'required',
    body: createSessionSchema,
    responses: { 201: 'Created' },
    handler: async (req, res) => {
      res.status(201).json(await c.sessions.create(currentUser(req), req.body));
    },
  });

  defineRoute(ctx, {
    method: 'get',
    path: '/:id',
    tag: 'Sessions',
    summary: 'Session detail with participants (private: participants only)',
    auth: 'optional',
    params: idParamSchema,
    handler: async (req, res) => {
      res.json(await c.sessions.get(req.params.id as string, req.user));
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/:id/join',
    tag: 'Sessions',
    summary: 'Join a session (inviteCode required for private sessions)',
    auth: 'required',
    params: idParamSchema,
    body: joinSessionSchema,
    responses: { 200: 'Joined', 404: 'Not found or wrong invite code', 409: 'Full or ended' },
    handler: async (req, res) => {
      res.json(
        await c.sessions.join(currentUser(req), req.params.id as string, req.body.inviteCode),
      );
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/:id/leave',
    tag: 'Sessions',
    summary: 'Leave a session',
    auth: 'required',
    params: idParamSchema,
    responses: { 204: 'Left' },
    handler: async (req, res) => {
      await c.sessions.leave(currentUser(req), req.params.id as string);
      res.status(204).end();
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/:id/start',
    tag: 'Sessions',
    summary: 'Start a scheduled session (host only)',
    auth: 'required',
    params: idParamSchema,
    handler: async (req, res) => {
      const s = await c.sessions.start(currentUser(req), req.params.id as string);
      broadcast.status(s.id, s.status);
      res.json(s);
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/:id/end',
    tag: 'Sessions',
    summary: 'End a session (host only); the editor becomes read-only',
    auth: 'required',
    params: idParamSchema,
    handler: async (req, res) => {
      const s = await c.sessions.end(currentUser(req), req.params.id as string);
      broadcast.status(s.id, s.status);
      res.json(s);
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/:id/invite-code',
    tag: 'Sessions',
    summary: 'Rotate the invite code of a private session (host only)',
    auth: 'required',
    params: idParamSchema,
    handler: async (req, res) => {
      res.json(await c.sessions.regenerateInvite(currentUser(req), req.params.id as string));
    },
  });

  defineRoute(ctx, {
    method: 'get',
    path: '/:id/messages',
    tag: 'Sessions',
    summary: 'Chat history, newest first (cursor pagination)',
    auth: 'required',
    params: idParamSchema,
    query: cursorQuerySchema,
    handler: async (req, res) => {
      res.json(
        await c.sessions.messages(
          currentUser(req),
          req.params.id as string,
          query<CursorQuery>(res),
        ),
      );
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/:id/messages',
    tag: 'Sessions',
    summary: 'Post a chat message (REST fallback for the socket event)',
    auth: 'required',
    params: idParamSchema,
    body: sendMessageSchema,
    responses: { 201: 'Created' },
    handler: async (req, res) => {
      const m = await c.sessions.postMessage(
        currentUser(req),
        req.params.id as string,
        req.body.content,
      );
      broadcast.message(m);
      res.status(201).json(m);
    },
  });
}
