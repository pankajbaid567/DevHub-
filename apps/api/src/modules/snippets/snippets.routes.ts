import {
  createSnippetSchema,
  idParamSchema,
  listSnippetsQuerySchema,
  updateSnippetSchema,
  type ListSnippetsQuery,
} from '@devhub/shared';
import type { Container } from '../../container.js';
import { defineRoute, type RouteContext } from '../../core/route.js';
import { query } from '../../core/validate.js';
import { currentUser } from '../../middleware/auth.js';

export function snippetRoutes(ctx: RouteContext, c: Container): void {
  defineRoute(ctx, {
    method: 'get',
    path: '/',
    tag: 'Snippets',
    summary: 'List public snippets (search, language, tag, author; sort by newest or stars)',
    auth: 'optional',
    query: listSnippetsQuerySchema,
    handler: async (req, res) => {
      res.json(await c.snippets.list(query<ListSnippetsQuery>(res), req.user));
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/',
    tag: 'Snippets',
    summary: 'Share a snippet',
    auth: 'required',
    body: createSnippetSchema,
    responses: { 201: 'Created' },
    handler: async (req, res) => {
      res.status(201).json(await c.snippets.create(currentUser(req), req.body));
    },
  });

  defineRoute(ctx, {
    method: 'get',
    path: '/:id',
    tag: 'Snippets',
    summary: 'Get a snippet (private snippets: author only)',
    auth: 'optional',
    params: idParamSchema,
    responses: { 200: 'OK', 404: 'Not found or private' },
    handler: async (req, res) => {
      res.json(await c.snippets.get(req.params.id as string, req.user));
    },
  });

  defineRoute(ctx, {
    method: 'patch',
    path: '/:id',
    tag: 'Snippets',
    summary: 'Edit a snippet (author or admin)',
    auth: 'required',
    params: idParamSchema,
    body: updateSnippetSchema,
    handler: async (req, res) => {
      res.json(await c.snippets.update(currentUser(req), req.params.id as string, req.body));
    },
  });

  defineRoute(ctx, {
    method: 'delete',
    path: '/:id',
    tag: 'Snippets',
    summary: 'Delete a snippet (author or admin)',
    auth: 'required',
    params: idParamSchema,
    responses: { 204: 'Deleted' },
    handler: async (req, res) => {
      await c.snippets.remove(currentUser(req), req.params.id as string);
      res.status(204).end();
    },
  });

  defineRoute(ctx, {
    method: 'put',
    path: '/:id/star',
    tag: 'Snippets',
    summary: 'Star a snippet (idempotent)',
    auth: 'required',
    params: idParamSchema,
    handler: async (req, res) => {
      res.json(await c.snippets.setStar(currentUser(req), req.params.id as string, true));
    },
  });

  defineRoute(ctx, {
    method: 'delete',
    path: '/:id/star',
    tag: 'Snippets',
    summary: 'Remove your star (idempotent)',
    auth: 'required',
    params: idParamSchema,
    handler: async (req, res) => {
      res.json(await c.snippets.setStar(currentUser(req), req.params.id as string, false));
    },
  });

  defineRoute(ctx, {
    method: 'post',
    path: '/:id/fork',
    tag: 'Snippets',
    summary: 'Fork a snippet into your library',
    auth: 'required',
    params: idParamSchema,
    responses: { 201: 'Forked' },
    handler: async (req, res) => {
      res.status(201).json(await c.snippets.fork(currentUser(req), req.params.id as string));
    },
  });
}
