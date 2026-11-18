import type { RequestHandler } from 'express';
import type { z, ZodType } from 'zod';
import { ValidationError } from './errors.js';

type Schemas = { body?: ZodType; query?: ZodType; params?: ZodType };

/** Converts zod issues into `{ "field.path": ["message", ...] }`. */
export function toFieldErrors(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_';
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

export function parseOrThrow<S extends ZodType>(schema: S, value: unknown): z.output<S> {
  const r = schema.safeParse(value);
  if (!r.success) throw new ValidationError(toFieldErrors(r.error));
  return r.data;
}

/**
 * Validates and *replaces* body/query/params with the parsed (coerced, defaulted, trimmed)
 * values, so handlers only ever see well-typed input. Express 5 makes `req.query` a getter,
 * so the parsed query is stored on `res.locals.query` and read via {@link query}.
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req, res, next) => {
    if (schemas.params) req.params = parseOrThrow(schemas.params, req.params) as typeof req.params;
    if (schemas.query) res.locals.query = parseOrThrow(schemas.query, req.query);
    if (schemas.body) req.body = parseOrThrow(schemas.body, req.body ?? {});
    next();
  };
}

/** Typed access to the validated query of the current request. */
export function query<T>(res: { locals: Record<string, unknown> }): T {
  return res.locals.query as T;
}
