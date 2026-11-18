export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface GenerateRequest {
  system: string;
  turns: ChatTurn[];
  /** When set, the provider must return JSON matching this JSON Schema. */
  jsonSchema?: Record<string, unknown>;
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export interface GenerateResult {
  text: string;
  model: string;
}

export interface StreamResult {
  model: string;
  chunks: AsyncIterable<string>;
}

/**
 * Strategy interface for LLM back-ends. The service layer depends only on this, so a
 * provider can be swapped (Gemini, OpenAI, a local model) or faked in tests.
 */
export interface AIProvider {
  readonly name: string;
  /** True for the keyless demo provider; surfaced to users so nothing pretends to be AI. */
  readonly isDemo: boolean;
  generate(req: GenerateRequest): Promise<GenerateResult>;
  stream(req: GenerateRequest): Promise<StreamResult>;
}

export class AIUnavailableError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AIUnavailableError';
  }
}
