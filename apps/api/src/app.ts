import express, { Router, type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import type { Container } from './container.js';
import { authMiddleware } from './middleware/auth.js';
import {
  errorHandler,
  httpLogger,
  httpMetrics,
  notFound,
  rateLimiters,
  requestId,
} from './middleware/http.js';
import type { RouteContext } from './core/route.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { answerRoutes, questionRoutes, tagRoutes } from './modules/questions/questions.routes.js';
import { snippetRoutes } from './modules/snippets/snippets.routes.js';
import { sessionRoutes } from './modules/sessions/sessions.routes.js';
import { interviewRoutes } from './modules/interviews/interview.routes.js';
import { progressRoutes } from './modules/interviews/progress.routes.js';
import { notificationRoutes, userRoutes } from './modules/users/users.routes.js';
import { aiRoutes } from './modules/ai/ai.routes.js';
import { searchRoutes } from './modules/search/search.routes.js';
import { adminRoutes, reportRoutes } from './modules/moderation/moderation.routes.js';
import type { SessionBroadcaster } from './realtime/socket.js';

export const API_PREFIX = '/api/v1';

const noopBroadcaster: SessionBroadcaster = {
  status: () => {},
  message: () => {},
  runStarted: () => {},
  runFinished: () => {},
  interview: () => {},
  submission: () => {},
};

export interface AppOptions {
  /** Real-time fan-out for REST-triggered events; absent in HTTP-only tests. */
  broadcaster?: SessionBroadcaster;
  /** Disable rate limits (integration tests hammer the API from one IP). */
  disableRateLimits?: boolean;
}

export function createApp(
  c: Container,
  opts: AppOptions = {},
): { app: Express; openapi: () => object } {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', c.env.TRUST_PROXY);
  app.set('query parser', 'extended');

  app.use(requestId);
  app.use(httpLogger(c.logger));
  app.use(httpMetrics(c.metrics));
  app.use(
    helmet({
      // The API serves JSON; only the Swagger UI page needs inline assets.
      contentSecurityPolicy: {
        directives: { 'script-src': ["'self'", "'unsafe-inline'"], 'img-src': ["'self'", 'data:'] },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(
    cors({
      origin: c.env.CORS_ORIGINS,
      credentials: true,
      exposedHeaders: ['X-Request-Id', 'RateLimit', 'RateLimit-Policy'],
    }),
  );
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());

  // --------------------------------------------------------------- operational endpoints
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: Math.round(process.uptime()) });
  });

  /** Readiness: only route traffic here when the database (and Redis, if used) respond. */
  app.get('/ready', async (_req, res) => {
    const checks: Record<string, 'ok' | 'fail'> = {};
    try {
      await c.db.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch {
      checks.database = 'fail';
    }
    if (c.redis) checks.redis = (await c.redis.ping().catch(() => null)) === 'PONG' ? 'ok' : 'fail';
    const ok = Object.values(checks).every((v) => v === 'ok');
    res.status(ok ? 200 : 503).json({ status: ok ? 'ready' : 'degraded', checks });
  });

  app.get('/metrics', (_req, res) => {
    res.type('text/plain; version=0.0.4').send(c.metrics.render());
  });

  // --------------------------------------------------------------- API v1
  const limiters = rateLimiters(c.redis, {
    aiPerHour: c.env.AI_REQUESTS_PER_HOUR,
    disabled: Boolean(opts.disableRateLimits) || !c.env.RATE_LIMITS_ENABLED,
    allowlist: c.env.RATE_LIMIT_ALLOWLIST,
  });
  const { requireAuth, optionalAuth, requireRole } = authMiddleware(c.tokens);
  const requireAdmin = requireRole('ADMIN');
  const registry = new OpenAPIRegistry();
  registry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  });

  const api = Router();
  api.use(limiters.api);

  const mount = (path: string, register: (ctx: RouteContext) => void) => {
    const router = Router();
    register({
      router,
      registry,
      prefix: `${API_PREFIX}${path}`,
      requireAuth,
      optionalAuth,
      requireAdmin,
    });
    api.use(path, router);
  };

  const broadcaster = opts.broadcaster ?? noopBroadcaster;
  mount('/auth', (ctx) => authRoutes(ctx, c, limiters.auth));
  mount('/questions', (ctx) => questionRoutes(ctx, c));
  mount('/answers', (ctx) => answerRoutes(ctx, c));
  mount('/tags', (ctx) => tagRoutes(ctx, c));
  mount('/snippets', (ctx) => snippetRoutes(ctx, c));
  mount('/sessions', (ctx) => {
    sessionRoutes(ctx, c, broadcaster);
    interviewRoutes(ctx, c, broadcaster);
  });
  mount('/practice', (ctx) => progressRoutes(ctx, c));
  mount('/users', (ctx) => userRoutes(ctx, c));
  mount('/notifications', (ctx) => notificationRoutes(ctx, c));
  mount('/ai', (ctx) => aiRoutes(ctx, c, limiters.ai));
  mount('/search', (ctx) => searchRoutes(ctx, c));
  mount('/reports', (ctx) => reportRoutes(ctx, c));
  mount('/admin', (ctx) => adminRoutes(ctx, c));
  app.use(API_PREFIX, api);

  const openapi = () =>
    new OpenApiGeneratorV3(registry.definitions).generateDocument({
      openapi: '3.0.3',
      info: {
        title: 'DevHub+ API',
        version: '1.0.0',
        description:
          'REST API for DevHub+. Errors share one shape: `{ "error": { "code", "message", "details?", "requestId" } }`. ' +
          'Real-time features use Socket.IO at `/socket.io` (see docs/REALTIME.md).',
      },
      servers: [{ url: '/' }],
    });

  let cachedDoc: object | null = null;
  app.get('/openapi.json', (_req, res) => {
    res.json((cachedDoc ??= openapi()));
  });
  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(undefined, {
      swaggerOptions: { url: '/openapi.json' },
      customSiteTitle: 'DevHub+ API',
    }),
  );

  app.use(notFound);
  app.use(errorHandler(c.logger));
  return { app, openapi };
}
