import http from 'node:http';
import { env } from './config/env.js';
import { createContainer } from './container.js';
import { createApp } from './app.js';
import { attachRealtime, type SessionBroadcaster } from './realtime/socket.js';

/**
 * Process entry point: wires the container, HTTP app and Socket.IO onto one server and
 * handles graceful shutdown (stop accepting, flush collaborative documents, close pools).
 */
async function main(): Promise<void> {
  const c = createContainer(env);
  const { logger } = c;

  // The broadcaster is created after the HTTP server exists; the app holds a late-bound proxy.
  let realtime: ReturnType<typeof attachRealtime> | null = null;
  const broadcaster: SessionBroadcaster = {
    status: (id, s) => realtime?.broadcaster.status(id, s),
    message: (m) => realtime?.broadcaster.message(m),
  };

  const { app } = createApp(c, { broadcaster });
  const server = http.createServer(app);
  realtime = attachRealtime(server, c);

  await c.db.$connect();
  server.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, ai: c.ai.isDemo ? 'demo' : env.GEMINI_MODEL, redis: Boolean(c.redis) },
      `DevHub+ API listening on http://localhost:${env.PORT} (docs at /docs)`,
    );
  });

  // Hourly housekeeping: drop long-expired refresh tokens.
  const purge = setInterval(() => {
    c.tokens.purgeExpired().then(
      (n) => n && logger.info({ purged: n }, 'expired refresh tokens purged'),
      (err) => logger.warn({ err }, 'token purge failed'),
    );
  }, 3_600_000);
  purge.unref();

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    const force = setTimeout(() => {
      logger.error('forced exit after 10 s');
      process.exit(1);
    }, 10_000);
    force.unref();
    try {
      await realtime?.close(); // flushes documents, closes sockets and the HTTP server
      await c.db.$disconnect();
      c.redis?.disconnect();
      logger.info('shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandled promise rejection'));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
