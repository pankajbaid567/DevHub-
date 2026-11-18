import { Redis } from 'ioredis';
import type { Env } from './config/env.js';
import { logger as rootLogger, type Logger } from './lib/logger.js';
import { createPrisma, type Db } from './lib/prisma.js';
import { MemoryCache, RedisCache, type Cache } from './lib/cache.js';
import { MetricsRegistry } from './lib/metrics.js';
import { EventBus } from './core/events.js';
import { TokenService } from './modules/auth/token.service.js';
import { AuthService } from './modules/auth/auth.service.js';
import { ReputationService } from './modules/questions/reputation.service.js';
import { QuestionsService } from './modules/questions/questions.service.js';
import { SnippetsService } from './modules/snippets/snippets.service.js';
import { SessionsService } from './modules/sessions/sessions.service.js';
import { NotificationsService } from './modules/notifications/notifications.service.js';
import { UsersService } from './modules/users/users.service.js';
import { AiService } from './modules/ai/ai.service.js';
import type { AIProvider } from './modules/ai/providers/provider.js';
import { GeminiProvider } from './modules/ai/providers/gemini.js';
import { DemoProvider } from './modules/ai/providers/demo.js';

/**
 * Composition root: the one place where concrete implementations are chosen and wired.
 * Services receive their dependencies through constructors (dependency injection), which
 * is what lets tests substitute a fake AI provider or an in-memory cache.
 */
export interface Container {
  env: Env;
  logger: Logger;
  db: Db;
  redis: Redis | null;
  cache: Cache;
  metrics: MetricsRegistry;
  events: EventBus;
  tokens: TokenService;
  auth: AuthService;
  questions: QuestionsService;
  snippets: SnippetsService;
  sessions: SessionsService;
  notifications: NotificationsService;
  users: UsersService;
  ai: AiService;
}

export interface ContainerOverrides {
  db?: Db;
  aiProvider?: AIProvider;
  redis?: Redis | null;
}

export function createContainer(env: Env, overrides: ContainerOverrides = {}): Container {
  const logger = rootLogger;
  const db = overrides.db ?? createPrisma();
  const redis =
    overrides.redis !== undefined
      ? overrides.redis
      : env.REDIS_URL
        ? new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2, connectTimeout: 5_000 })
        : null;
  redis?.on('error', (err) => logger.warn({ err: err.message }, 'redis error'));

  const cache: Cache = redis ? new RedisCache(redis) : new MemoryCache();
  const metrics = new MetricsRegistry();
  const events = new EventBus(logger);

  const tokens = new TokenService(db, env, logger);
  const reputation = new ReputationService();
  const notifications = new NotificationsService(db);
  notifications.subscribe(events);

  const aiProvider: AIProvider =
    overrides.aiProvider ??
    (env.aiEnabled
      ? new GeminiProvider(
          {
            apiKey: env.GEMINI_API_KEY!,
            model: env.GEMINI_MODEL,
            fallbackModel: env.GEMINI_FALLBACK_MODEL,
            timeoutMs: env.AI_TIMEOUT_MS,
          },
          logger,
        )
      : new DemoProvider());

  return {
    env,
    logger,
    db,
    redis,
    cache,
    metrics,
    events,
    tokens,
    auth: new AuthService(db, tokens),
    questions: new QuestionsService(db, cache, events, reputation),
    snippets: new SnippetsService(db, events),
    sessions: new SessionsService(db, events),
    notifications,
    users: new UsersService(db, cache),
    ai: new AiService(db, aiProvider, logger, metrics),
  };
}
