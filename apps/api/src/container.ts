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
import { EmailTokenService } from './modules/auth/email-token.service.js';
import { OAuthService } from './modules/auth/oauth.service.js';
import { GeminiEmbedder, HashEmbedder, type Embedder } from './modules/search/embedder.js';
import { SearchIndexer } from './modules/search/indexer.js';
import { SearchService } from './modules/search/search.service.js';
import { BullJobQueue, InlineJobQueue, type JobHandlers, type JobQueue } from './jobs/queue.js';
import { Outbox } from './jobs/outbox.js';
import { LogMailer, SmtpMailer, type Mailer } from './jobs/mailer.js';
import { createHandlers } from './jobs/handlers.js';
import { RunsService } from './modules/runs/runs.service.js';
import {
  DisabledCodeRunner,
  HttpCodeRunner,
  type CodeRunner,
} from './modules/runs/runner.client.js';

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
  queue: JobQueue;
  outbox: Outbox;
  mailer: Mailer;
  oauth: OAuthService;
  indexer: SearchIndexer;
  search: SearchService;
  runs: RunsService;
}

export interface ContainerOverrides {
  db?: Db;
  aiProvider?: AIProvider;
  redis?: Redis | null;
  mailer?: Mailer;
  embedder?: Embedder;
  /** HTTP client for OAuth provider calls (faked in tests). */
  oauthFetch?: typeof fetch;
  oauthConfigs?: Env['oauth'];
  codeRunner?: CodeRunner;
  /** Retry delay for the in-process queue (tests use 0). */
  inlineRetryDelay?: (attempt: number) => number;
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

  // Jobs: the queue reads handlers at run time, so they can be filled in after construction
  // (handlers depend on services that themselves enqueue jobs).
  const handlers = {} as JobHandlers;
  const queue: JobQueue =
    env.REDIS_URL && overrides.redis !== null
      ? new BullJobQueue(
          new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }),
          handlers,
          logger,
          metrics,
        )
      : new InlineJobQueue(handlers, logger, metrics, overrides.inlineRetryDelay);
  const outbox = new Outbox(db, queue, logger);
  const mailer: Mailer =
    overrides.mailer ??
    (env.SMTP_URL ? new SmtpMailer(env.SMTP_URL, env.MAIL_FROM) : new LogMailer(logger));

  const notifications = new NotificationsService(db, outbox, env.publicUrl);
  notifications.subscribe(events);

  const embedder: Embedder =
    overrides.embedder ??
    (env.aiEnabled
      ? new GeminiEmbedder(env.GEMINI_API_KEY!, env.GEMINI_EMBED_MODEL)
      : new HashEmbedder());
  const indexer = new SearchIndexer(db, embedder);
  const search = new SearchService(db, embedder, cache);
  // Index asynchronously after every content change; the reconcile job heals anything missed.
  events.on('content.changed', (e) => queue.add('search.index', e));

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

  const sessions = new SessionsService(db, events, outbox);
  const codeRunner: CodeRunner =
    overrides.codeRunner ??
    (env.CODE_RUNNER_URL && env.RUNNER_TOKEN
      ? new HttpCodeRunner(env.CODE_RUNNER_URL, env.RUNNER_TOKEN)
      : new DisabledCodeRunner());

  Object.assign(
    handlers,
    createHandlers({ db, logger, mailer, outbox, tokens, notifications, indexer }),
  );

  return {
    env,
    logger,
    db,
    redis,
    cache,
    metrics,
    events,
    tokens,
    auth: new AuthService(db, tokens, new EmailTokenService(), outbox, env.publicUrl),
    questions: new QuestionsService(db, cache, events, reputation),
    snippets: new SnippetsService(db, events),
    sessions,
    notifications,
    users: new UsersService(db, cache),
    ai: new AiService(db, aiProvider, logger, metrics, (text) => search.retrieve(text)),
    queue,
    outbox,
    mailer,
    oauth: new OAuthService(
      overrides.oauthConfigs ?? env.oauth,
      env.publicUrl,
      overrides.oauthFetch,
    ),
    indexer,
    search,
    runs: new RunsService(db, cache, sessions, codeRunner, logger),
  };
}
