import { describe, expect, it, vi } from 'vitest';
import { GeminiProvider } from '../src/modules/ai/providers/gemini.js';
import { AIUnavailableError } from '../src/modules/ai/providers/provider.js';
import { logger } from '../src/lib/logger.js';

type Call = { model: string; signal: AbortSignal };

/** Fake @google/genai client: each model gets a scripted behaviour. */
function fakeClient(behaviour: Record<string, 'ok' | 'hang' | '503'>) {
  const calls: Call[] = [];
  const generateContent = vi.fn(
    async (p: { model: string; config: { abortSignal: AbortSignal } }) => {
      calls.push({ model: p.model, signal: p.config.abortSignal });
      const b = behaviour[p.model];
      if (b === 'ok') return { text: `reply from ${p.model}` };
      if (b === '503') throw Object.assign(new Error('overloaded'), { status: 503 });
      return new Promise((_, reject) =>
        p.config.abortSignal.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
        ),
      );
    },
  );
  return {
    calls,
    client: { models: { generateContent, generateContentStream: vi.fn() } } as never,
  };
}

const opts = { apiKey: 'k', model: 'primary', fallbackModel: 'fallback', timeoutMs: 500 };
const req = { system: 's', turns: [{ role: 'user' as const, content: 'hi' }] };

describe('GeminiProvider resilience', () => {
  it('falls back when the primary hangs past its share of the time budget', async () => {
    const { client, calls } = fakeClient({ primary: 'hang', fallback: 'ok' });
    const p = new GeminiProvider(opts, logger, client);
    const started = Date.now();
    await expect(p.generate(req)).resolves.toEqual({
      text: 'reply from fallback',
      model: 'fallback',
    });
    expect(calls.map((c) => c.model)).toEqual(['primary', 'fallback']);
    expect(Date.now() - started).toBeLessThan(1_500); // 60% of 500 ms, then the fallback
  });

  it('opens the circuit after two primary failures and skips the primary while open', async () => {
    const { client, calls } = fakeClient({ primary: '503', fallback: 'ok' });
    const p = new GeminiProvider(opts, logger, client);
    await p.generate(req);
    await p.generate(req);
    await p.generate(req); // breaker open: straight to the fallback
    expect(calls.map((c) => c.model)).toEqual([
      'primary',
      'fallback',
      'primary',
      'fallback',
      'fallback',
    ]);
  });

  it('does not retry on the fallback when the caller cancelled', async () => {
    const { client, calls } = fakeClient({ primary: 'hang', fallback: 'ok' });
    const p = new GeminiProvider({ ...opts, timeoutMs: 10_000 }, logger, client);
    const abort = new AbortController();
    setTimeout(() => abort.abort(), 50);
    await expect(p.generate({ ...req, signal: abort.signal })).rejects.toBeInstanceOf(
      AIUnavailableError,
    );
    expect(calls.map((c) => c.model)).toEqual(['primary']);
  });

  it('surfaces a clear error when both models fail', async () => {
    const { client } = fakeClient({ primary: '503', fallback: '503' });
    await expect(new GeminiProvider(opts, logger, client).generate(req)).rejects.toThrow(
      /temporarily unavailable/,
    );
  });
});
