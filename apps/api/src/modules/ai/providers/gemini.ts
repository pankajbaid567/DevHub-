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
  ) {
    this.client = new GoogleGenAI({ apiKey: opts.apiKey });
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

  /** Combines the caller's signal (client disconnected) with a hard timeout. */
  private signal(req: GenerateRequest): AbortSignal {
    const timeout = AbortSignal.timeout(this.opts.timeoutMs);
    return req.signal ? AbortSignal.any([req.signal, timeout]) : timeout;
  }

  private async withFallback<T>(op: (model: string) => Promise<T>): Promise<T> {
    try {
      return await op(this.opts.model);
    } catch (err) {
      if (!isFallbackWorthy(err) || this.opts.fallbackModel === this.opts.model) {
        throw new AIUnavailableError('The AI service failed to respond', err);
      }
      this.logger.warn(
        { err, model: this.opts.model, fallback: this.opts.fallbackModel },
        'gemini primary failed; using fallback',
      );
      try {
        return await op(this.opts.fallbackModel);
      } catch (fallbackErr) {
        throw new AIUnavailableError('The AI service is temporarily unavailable', fallbackErr);
      }
    }
  }

  generate(req: GenerateRequest): Promise<GenerateResult> {
    return this.withFallback(async (model) => {
      const res = await this.client.models.generateContent(
        this.params(model, req, this.signal(req)),
      );
      const text = res.text;
      if (!text) throw new AIUnavailableError('The AI returned an empty response');
      return { text, model };
    });
  }

  stream(req: GenerateRequest): Promise<StreamResult> {
    return this.withFallback(async (model) => {
      // Await the first call so connection/quota errors trigger the fallback before streaming starts.
      const iterator = await this.client.models.generateContentStream(
        this.params(model, req, this.signal(req)),
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
