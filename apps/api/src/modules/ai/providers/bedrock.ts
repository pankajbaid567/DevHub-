import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
  type Message,
  type SystemContentBlock,
  type ContentBlock,
} from '@aws-sdk/client-bedrock-runtime';
import type { Logger } from '../../../lib/logger.js';
import {
  AIUnavailableError,
  type AIProvider,
  type GenerateRequest,
  type GenerateResult,
  type StreamResult,
} from './provider.js';

interface BedrockOptions {
  region: string;
  model: string;
  fallbackModel: string;
  timeoutMs: number;
}

function isRetryable(err: unknown): boolean {
  const name = (err as { name?: string })?.name ?? '';
  const msg = String((err as Error)?.message ?? err).toLowerCase();
  return (
    name === 'ThrottlingException' ||
    name === 'ServiceUnavailableException' ||
    name === 'ModelTimeoutException' ||
    name === 'ModelNotReadyException' ||
    /throttl|rate|overloaded|unavailable|timeout|not ready/.test(msg)
  );
}

export class BedrockProvider implements AIProvider {
  readonly name = 'bedrock';
  readonly isDemo = false;
  private readonly client: BedrockRuntimeClient;

  constructor(
    private readonly opts: BedrockOptions,
    private readonly logger: Logger,
  ) {
    this.client = new BedrockRuntimeClient({ region: opts.region });
  }

  private buildMessages(req: GenerateRequest): {
    system: SystemContentBlock[];
    messages: Message[];
  } {
    const system: SystemContentBlock[] = [{ text: req.system }];
    const messages: Message[] = req.turns.map((t) => ({
      role: t.role === 'assistant' ? 'assistant' : 'user',
      content: [{ text: t.content }] as ContentBlock[],
    }));
    return { system, messages };
  }

  private primaryFailures = 0;
  private primaryOpenUntil = 0;

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
        const signal = req.signal
          ? AbortSignal.any([req.signal, AbortSignal.timeout(hasFallback ? Math.round(budget * 0.6) : budget)])
          : AbortSignal.timeout(hasFallback ? Math.round(budget * 0.6) : budget);
        const result = await op(this.opts.model, signal);
        this.primaryFailures = 0;
        return result;
      } catch (err) {
        if (req.signal?.aborted) throw new AIUnavailableError('Request cancelled', err);
        const timedOut =
          (err as Error)?.name === 'AbortError' || (err as Error)?.name === 'TimeoutError';
        if (!hasFallback || !(timedOut || isRetryable(err))) {
          throw new AIUnavailableError('The AI service failed to respond', err);
        }
        if (++this.primaryFailures >= 2) this.primaryOpenUntil = Date.now() + 60_000;
        this.logger.warn(
          { err: (err as Error)?.message, model: this.opts.model, fallback: this.opts.fallbackModel },
          'bedrock primary failed; using fallback',
        );
      }
    }

    try {
      const remaining = Math.max(5_000, budget - (Date.now() - started));
      const signal = req.signal
        ? AbortSignal.any([req.signal, AbortSignal.timeout(remaining)])
        : AbortSignal.timeout(remaining);
      return await op(this.opts.fallbackModel, signal);
    } catch (fallbackErr) {
      throw new AIUnavailableError('The AI service is temporarily unavailable', fallbackErr);
    }
  }

  generate(req: GenerateRequest): Promise<GenerateResult> {
    return this.withFallback(req, async (model, signal) => {
      const { system, messages } = this.buildMessages(req);
      const cmd = new ConverseCommand({
        modelId: model,
        system,
        messages,
        inferenceConfig: {
          temperature: req.temperature ?? 0.4,
          maxTokens: req.maxOutputTokens ?? 4_096,
        },
      });
      const res = await this.client.send(cmd, { abortSignal: signal });
      const text = res.output?.message?.content?.[0]?.text;
      if (!text) throw new AIUnavailableError('Bedrock returned an empty response');
      return { text, model };
    });
  }

  stream(req: GenerateRequest): Promise<StreamResult> {
    return this.withFallback(req, async (model, signal) => {
      const { system, messages } = this.buildMessages(req);
      const cmd = new ConverseStreamCommand({
        modelId: model,
        system,
        messages,
        inferenceConfig: {
          temperature: req.temperature ?? 0.4,
          maxTokens: req.maxOutputTokens ?? 4_096,
        },
      });
      const res = await this.client.send(cmd, { abortSignal: signal });
      const stream = res.stream;
      if (!stream) throw new AIUnavailableError('Bedrock returned no stream');

      async function* chunks() {
        for await (const event of stream!) {
          if (event.contentBlockDelta?.delta?.text) {
            yield event.contentBlockDelta.delta.text;
          }
        }
      }
      return { model, chunks: chunks() };
    });
  }
}
