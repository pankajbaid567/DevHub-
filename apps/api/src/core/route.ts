import type { RequestHandler, Router } from 'express';
import type { ZodObject, ZodType } from 'zod';
import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { validate } from './validate.js';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface RouteDef {
  method: Method;
  path: string;
  summary: string;
  tag: string;
  auth?: 'required' | 'optional' | 'none';
  body?: ZodType;
  query?: ZodObject;
  params?: ZodObject;
  /** Status code -> description, for the generated docs. */
  responses?: Record<number, string>;
  middleware?: RequestHandler[];
  handler: RequestHandler;
}

export interface RouteContext {
  router: Router;
  registry: OpenAPIRegistry;
  /** Mount prefix, used only for the documented path (e.g. "/api/v1/questions"). */
  prefix: string;
  requireAuth: RequestHandler;
  optionalAuth: RequestHandler;
}

const toOpenApiPath = (p: string) => p.replace(/:(\w+)/g, '{$1}');

/**
 * Declares an endpoint once: Express handler, auth, zod validation and OpenAPI docs all come
 * from the same definition, so the published contract cannot drift from the implementation.
 */
export function defineRoute(ctx: RouteContext, def: RouteDef): void {
  const auth = def.auth ?? 'none';
  const chain: RequestHandler[] = [];
  if (auth === 'required') chain.push(ctx.requireAuth);
  if (auth === 'optional') chain.push(ctx.optionalAuth);
  chain.push(...(def.middleware ?? []));
  if (def.body || def.query || def.params) {
    chain.push(validate({ body: def.body, query: def.query, params: def.params }));
  }
  chain.push(def.handler);
  ctx.router[def.method](def.path, ...chain);

  const responses: Record<string, { description: string }> = {};
  for (const [status, description] of Object.entries(def.responses ?? { 200: 'OK' }))
    responses[status] = { description };
  if (def.body || def.query || def.params)
    responses['400'] ??= { description: 'Validation failed' };
  if (auth === 'required') responses['401'] ??= { description: 'Not signed in or token expired' };

  ctx.registry.registerPath({
    method: def.method,
    path: toOpenApiPath(ctx.prefix + (def.path === '/' ? '' : def.path)),
    summary: def.summary,
    tags: [def.tag],
    ...(auth === 'required' && { security: [{ bearerAuth: [] }] }),
    request: {
      ...(def.params && { params: def.params }),
      ...(def.query && { query: def.query }),
      ...(def.body && { body: { content: { 'application/json': { schema: def.body } } } }),
    },
    responses,
  });
}
