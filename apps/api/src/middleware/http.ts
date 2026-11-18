import { randomUUID } from 'node:crypto';
import { BlockList } from 'node:net';
import type { ErrorRequestHandler, Request, RequestHandler } from 'express';
import { pinoHttp } from 'pino-http';
import multer from 'multer';
import { rateLimit, type Store } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import type { Redis } from 'ioredis';
import { ErrorCode, type ApiErrorBody } from '@devhub/shared';
import { AppError } from '../core/errors.js';
import type { Logger } from '../lib/logger.js';
import type { MetricsRegistry } from '../lib/metrics.js';

/** Propagates an incoming X-Request-Id (from a proxy) or creates one, and echoes it back. */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header('x-request-id');
  const id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
};

export const httpLogger = (logger: Logger) =>
  pinoHttp({
    logger,
    genReqId: (req) => (req as { requestId?: string }).requestId ?? randomUUID(),
    customLogLevel: (_req, res, err) =>
      err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
    autoLogging: { ignore: (req) => ['/health', '/ready', '/metrics'].includes(req.url ?? '') },
    serializers: {
      req: (req: { id: string; method: string; url: string }) => ({
        id: req.id,
        method: req.method,
        url: req.url,
      }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
  });

/** Records request count and latency labelled by the *route pattern* (bounded cardinality). */
export const httpMetrics =
  (metrics: MetricsRegistry): RequestHandler =>
  (req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : 'unmatched';
      const labels = { method: req.method, route, status: res.statusCode };
      metrics.httpRequests.inc(labels);
      metrics.httpDuration.observe(
        { method: req.method, route },
        Number(process.hrtime.bigint() - start) / 1e9,
      );
    });
    next();
  };

export const notFound: RequestHandler = (req, res) => {
  const body: ApiErrorBody = {
    error: {
      code: ErrorCode.NOT_FOUND,
      message: `No route for ${req.method} ${req.path}`,
      ...(req.requestId && { requestId: req.requestId }),
    },
  };
  res.status(404).json(body);
};

/**
 * Single exit point for errors. Known errors map to their status and code; body-parser and
 * multer errors map to 400/413/415; everything else is an unexpected 500 whose details are
 * logged but never sent to the client.
 */
export const errorHandler =
  (logger: Logger): ErrorRequestHandler =>
  (err, req, res, _next) => {
    let status = 500;
    let code: ErrorCode = ErrorCode.INTERNAL;
    let message = 'Something went wrong on our side. Please try again.';
    let details: Record<string, string[]> | undefined;

    if (err instanceof AppError) {
      ({ status, code, message, details } = err);
    } else if (err instanceof multer.MulterError) {
      status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      code =
        err.code === 'LIMIT_FILE_SIZE' ? ErrorCode.PAYLOAD_TOO_LARGE : ErrorCode.VALIDATION_FAILED;
      message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large' : err.message;
    } else if (err?.type === 'entity.too.large') {
      status = 413;
      code = ErrorCode.PAYLOAD_TOO_LARGE;
      message = 'Request body is too large';
    } else if (err?.type === 'entity.parse.failed') {
      status = 400;
      code = ErrorCode.VALIDATION_FAILED;
      message = 'Malformed JSON body';
    }

    if (status >= 500) logger.error({ err, requestId: req.requestId }, 'unhandled error');
    if (res.headersSent) return;
    const body: ApiErrorBody = {
      error: {
        code,
        message,
        ...(details && { details }),
        ...(req.requestId && { requestId: req.requestId }),
      },
    };
    res.status(status).json(body);
  };

/** Rate limiters share Redis when available, so limits hold across all API instances. */
/**
 * Parses "10.0.0.5,172.16.0.0/12" into a matcher. Used to exempt trusted internal clients
 * (monitors, load generators) from rate limits without turning limits off for everyone.
 */
export function ipAllowlist(spec: string[]): (ip: string | undefined) => boolean {
  if (!spec.length) return () => false;
  const list = new BlockList();
  for (const entry of spec) {
    const [addr, bits] = entry.split('/');
    const type = addr!.includes(':') ? 'ipv6' : 'ipv4';
    if (bits) list.addSubnet(addr!, Number(bits), type);
    else list.addAddress(addr!, type);
  }
  return (ip) => {
    if (!ip) return false;
    const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
    return list.check(v4, v4.includes(':') ? 'ipv6' : 'ipv4');
  };
}

export function rateLimiters(
  redis: Redis | null,
  opts: { aiPerHour: number; disabled: boolean; allowlist?: string[] },
) {
  const allowed = ipAllowlist(opts.allowlist ?? []);
  const store = (prefix: string): Store | undefined =>
    redis
      ? new RedisStore({
          prefix: `devhub:rl:${prefix}:`,
          sendCommand: (command: string, ...args: string[]) =>
            redis.call(command, ...args) as Promise<RedisReply>,
        })
      : undefined;

  const handler: RequestHandler = (_req, res) => {
    const body: ApiErrorBody = {
      error: { code: ErrorCode.RATE_LIMITED, message: 'Too many requests, please slow down' },
    };
    res.status(429).json(body);
  };
  const common = {
    standardHeaders: 'draft-8' as const,
    legacyHeaders: false,
    handler,
    skip: (req: Request) => opts.disabled || allowed(req.ip),
  };

  return {
    /** Broad abuse protection for the whole API. */
    api: rateLimit({ ...common, windowMs: 60_000, limit: 300, store: store('api') }),
    /** Credential endpoints: slows brute force and credential stuffing. */
    auth: rateLimit({ ...common, windowMs: 15 * 60_000, limit: 20, store: store('auth') }),
    /** AI calls cost money: limited per user, not per IP. */
    ai: rateLimit({
      ...common,
      windowMs: 60 * 60_000,
      limit: opts.aiPerHour,
      store: store('ai'),
      keyGenerator: (req) => `user:${req.user?.id ?? 'anon'}`,
    }),
  };
}
