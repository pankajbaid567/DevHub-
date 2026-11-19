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
    runStarted: (id, u, l) => realtime?.broadcaster.runStarted(id, u, l),
    runFinished: (r) => realtime?.broadcaster.runFinished(r),
    interview: (s) => realtime?.broadcaster.interview(s),
  };

  const { app } = createApp(c, { broadcaster });
  const server = http.createServer(app);
  // Outlive the reverse proxy's idle upstream connections (nginx: 30 s). With Node's 5 s
  // default, nginx sometimes reuses a socket Node is closing, and POSTs fail with 502
  // (found by the load test: 5 of 17k votes). headersTimeout must exceed keepAliveTimeout.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  realtime = attachRealtime(server, c);

  await c.db.$connect();
  server.listen(env.PORT, () => {
    logger.info(
      {
        port: env.PORT,
        ai: c.ai.isDemo ? 'demo' : env.GEMINI_MODEL,
        embeddings: c.search.model,
        redis: Boolean(c.redis),
        queue: c.queue.kind,
        mail: c.mailer.kind,
      },
      `DevHub+ API listening on http://localhost:${env.PORT} (docs at /docs)`,
    );
  });

  // Background work. Every replica relays its share of the outbox (SKIP LOCKED); replicas with
  // WORKER_ENABLED also consume jobs. Repeating jobs are deduplicated across replicas by name.
  c.outbox.start();
  if (env.WORKER_ENABLED) {
    c.queue.startWorker();
    await c.queue.every('maintenance.cleanup', 3_600_000);
    await c.queue.every('search.reconcile', 10 * 60_000);
    // Index existing content right away on first boot (or after changing the embedder).
    await c.queue.add(
      'search.reconcile',
      {},
      { jobId: `reconcile-boot-${Math.floor(Date.now() / 60_000)}` },
    );
  }

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
      await c.outbox.stop();
      await c.queue.close(); // lets running jobs finish; unfinished ones are retried elsewhere
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
