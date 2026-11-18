import { Redis } from 'ioredis';
import { afterAll, describe, expect, it } from 'vitest';
import { BullJobQueue, type JobHandlers } from '../src/jobs/queue.js';
import { MetricsRegistry } from '../src/lib/metrics.js';
import { logger } from '../src/lib/logger.js';

/**
 * Integration test against a real Redis (BullMQ semantics: retries, dedup by job id,
 * competing consumers). Runs when TEST_REDIS_URL is set (CI and local docker compose).
 */
const url = process.env.TEST_REDIS_URL;
const suite = url ? describe : describe.skip;

suite('BullMQ queue (real Redis)', () => {
  const name = `test-${Date.now()}`;
  const queues: BullJobQueue[] = [];
  const make = (handlers: Partial<JobHandlers>) => {
    const q = new BullJobQueue(
      new Redis(url!, { maxRetriesPerRequest: null }),
      handlers as JobHandlers,
      logger,
      new MetricsRegistry(),
      name,
    );
    queues.push(q);
    return q;
  };
  afterAll(async () => {
    await Promise.all(queues.map((q) => q.close()));
    const r = new Redis(url!);
    const keys = await r.keys(`devhub:bull:${name}:*`);
    if (keys.length) await r.del(...keys);
    r.disconnect();
  });

  it('retries failures, dedupes by job id and spreads work across consumers', async () => {
    const seen: string[] = [];
    let failuresLeft = 1;
    const done = new Promise<void>((resolve) => {
      const handler = async (msg: { to: string }) => {
        if (msg.to === 'flaky@example.com' && failuresLeft-- > 0) throw new Error('transient');
        seen.push(msg.to);
        if (seen.length === 5) resolve();
      };
      // Two workers on the same queue: competing consumers.
      make({ 'email.send': handler as never }).startWorker();
      make({ 'email.send': handler as never }).startWorker();
    });
    const producer = queues[0]!;
    const msg = (to: string) => ({ to, subject: 's', text: 't', html: 'h' });
    for (const to of ['a', 'b', 'c', 'd'].map((x) => `${x}@example.com`))
      await producer.add('email.send', msg(to), { jobId: `job-${to}` });
    await producer.add('email.send', msg('a@example.com'), { jobId: 'job-a@example.com' }); // duplicate
    await producer.add('email.send', msg('flaky@example.com'));
    await done;
    expect(seen.sort()).toEqual(
      ['a', 'b', 'c', 'd', 'flaky'].map((x) => `${x}@example.com`).sort(),
    );
  }, 30_000);
});
