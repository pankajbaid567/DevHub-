import { GoogleGenAI, type Content, type GenerateContentParameters } from '@google/genai';
import type { Logger } from '../../../lib/logger.js';
import {
  AIUnavailableError,
  type AIProvider,
  type GenerateRequest,
  type GenerateResult,
  type StreamResult,
} from './provider.js';

interface GeminiOptions {
  apiKey: string;
  model: string;
  fallbackModel: string;
  timeoutMs: number;
}

/** Errors worth retrying on the fallback model: quota, overload, model not available. */
function isFallbackWorthy(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  const msg = String((err as Error)?.message ?? err).toLowerCase();
  return (
    status === 429 ||
    status === 404 ||
    (status !== undefined && status >= 500) ||
    /quota|rate limit|overloaded|unavailable|not found|resource_exhausted/.test(msg)
  );
}

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  readonly isDemo = false;
  private readonly client: GoogleGenAI;

  constructor(
    private readonly opts: GeminiOptions,
    private readonly logger: Logger,
    client?: Pick<GoogleGenAI, 'models'>,
  ) {
    this.client = (client as GoogleGenAI | undefined) ?? new GoogleGenAI({ apiKey: opts.apiKey });
  }

  private params(
    model: string,
    req: GenerateRequest,
    signal: AbortSignal,
  ): GenerateContentParameters {
    const contents: Content[] = req.turns.map((t) => ({
      role: t.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: t.content }],
    }));
    return {
      model,
      contents,
      config: {
        systemInstruction: req.system,
        temperature: req.temperature ?? 0.4,
        maxOutputTokens: req.maxOutputTokens ?? 4_096,
        abortSignal: signal,
        ...(req.jsonSchema && {
          responseMimeType: 'application/json',
          responseJsonSchema: req.jsonSchema,
        }),
      },
    };
  }

  /** Circuit breaker state for the primary model. */
  private primaryFailures = 0;
  private primaryOpenUntil = 0;

  /** Combines the caller's signal (client disconnected) with a per-attempt timeout. */
  private signal(req: GenerateRequest, timeoutMs: number): AbortSignal {
    const timeout = AbortSignal.timeout(timeoutMs);
    return req.signal ? AbortSignal.any([req.signal, timeout]) : timeout;
  }

  /**
   * Primary model with a fallback, a split time budget and a circuit breaker:
   * - the primary gets 60% of the budget; a timeout, quota or overload falls back to the
   *   second model with the remaining time (but not if the caller itself aborted);
   * - after 2 consecutive primary failures the breaker opens for 60 s and requests go
   *   straight to the fallback, so users do not pay the failure latency on every call;
   *   once the window passes the primary is probed again (half-open) and one more failure
   *   reopens it.
   */
  private async withFallback<T>(
    req: GenerateRequest,
    op: (model: string, signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const budget = this.opts.timeoutMs;
    const hasFallback = this.opts.fallbackModel !== this.opts.model;
    const breakerOpen = hasFallback && Date.now() < this.primaryOpenUntil;
    const started = Date.now();

    if (!breakerOpen) {
      try {
        const result = await op(
          this.opts.model,
          this.signal(req, hasFallback ? Math.round(budget * 0.6) : budget),
        );
        this.primaryFailures = 0;
        return result;
      } catch (err) {
        if (req.signal?.aborted) throw new AIUnavailableError('Request cancelled', err);
        const timedOut =
          (err as Error)?.name === 'AbortError' || (err as Error)?.name === 'TimeoutError';
        if (!hasFallback || !(timedOut || isFallbackWorthy(err))) {
          throw new AIUnavailableError('The AI service failed to respond', err);
        }
        if (++this.primaryFailures >= 2) this.primaryOpenUntil = Date.now() + 60_000;
        this.logger.warn(
          {
            err: (err as Error)?.message,
            model: this.opts.model,
            fallback: this.opts.fallbackModel,
            breakerOpen: this.primaryFailures >= 2,
          },
          'gemini primary failed; using fallback',
        );
      }
    }

    try {
      const remaining = Math.max(5_000, budget - (Date.now() - started));
      return await op(this.opts.fallbackModel, this.signal(req, remaining));
    } catch (fallbackErr) {
      throw new AIUnavailableError('The AI service is temporarily unavailable', fallbackErr);
    }
  }

  generate(req: GenerateRequest): Promise<GenerateResult> {
    return this.withFallback(req, async (model, signal) => {
      const res = await this.client.models.generateContent(this.params(model, req, signal));
      const text = res.text;
      if (!text) throw new AIUnavailableError('The AI returned an empty response');
      return { text, model };
    });
  }

  stream(req: GenerateRequest): Promise<StreamResult> {
    return this.withFallback(req, async (model, signal) => {
      // Await the first call so connection/quota errors trigger the fallback before streaming starts.
      const iterator = await this.client.models.generateContentStream(
        this.params(model, req, signal),
      );
      async function* chunks() {
        for await (const part of iterator) {
          if (part.text) yield part.text;
        }
      }
      return { model, chunks: chunks() };
    });
  }
}
