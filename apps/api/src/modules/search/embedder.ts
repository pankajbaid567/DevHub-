import { createHash } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';

/** Must match `vector(768)` in the schema. */
export const EMBEDDING_DIMS = 768;

export type EmbedKind = 'document' | 'query';

/**
 * Strategy for turning text into vectors. Rows store the embedder's `model` name, so
 * switching embedders makes the reconcile job re-index everything automatically:
 * vectors from different models are never compared with each other.
 */
export interface Embedder {
  readonly model: string;
  embed(texts: string[], kind: EmbedKind): Promise<number[][]>;
}

export function normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

/**
 * Gemini embeddings. Asymmetric task types (document vs query) give better retrieval than
 * embedding both sides the same way. Reduced-dimension outputs are not unit length, so
 * they are normalised here (cosine distance in pgvector does not care, but dot products do).
 */
export class GeminiEmbedder implements Embedder {
  private readonly client: Pick<GoogleGenAI, 'models'>;

  constructor(
    apiKey: string,
    readonly model: string,
    client?: Pick<GoogleGenAI, 'models'>,
  ) {
    this.client = client ?? new GoogleGenAI({ apiKey });
  }

  async embed(texts: string[], kind: EmbedKind): Promise<number[][]> {
    const out: number[][] = [];
    // The API accepts up to 100 inputs per call.
    for (let i = 0; i < texts.length; i += 100) {
      const res = await this.client.models.embedContent({
        model: this.model,
        contents: texts.slice(i, i + 100),
        config: {
          taskType: kind === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT',
          outputDimensionality: EMBEDDING_DIMS,
          abortSignal: AbortSignal.timeout(20_000),
        },
      });
      for (const e of res.embeddings ?? []) out.push(normalize(e.values ?? []));
    }
    if (out.length !== texts.length || out.some((v) => v.length !== EMBEDDING_DIMS))
      throw new Error('Embedding response did not match the request');
    return out;
  }
}

const STOP = new Set(
  'a an and are as at be but by can do does for from how i if in into is it of on or so that the this to was what when where which why with you your'.split(
    ' ',
  ),
);

/**
 * Keyless fallback: feature hashing of word unigrams, bigrams and character trigrams into a
 * fixed-size signed vector. It captures lexical overlap and typos, not meaning, but it lets
 * duplicate detection and related questions work offline, in CI and in tests.
 */
export class HashEmbedder implements Embedder {
  readonly model = `hash-v1-${EMBEDDING_DIMS}`;

  embed(texts: string[]): Promise<number[][]> {
    return Promise.resolve(texts.map((t) => this.vector(t)));
  }

  private vector(text: string): number[] {
    const v = new Array<number>(EMBEDDING_DIMS).fill(0);
    const words = text
      .toLowerCase()
      .split(/[^a-z0-9+#]+/)
      .filter((w) => w.length > 1 && !STOP.has(w));
    const add = (feature: string, weight: number) => {
      const h = createHash('md5').update(feature).digest();
      const idx = h.readUInt32LE(0) % EMBEDDING_DIMS;
      v[idx]! += (h[4]! & 1 ? 1 : -1) * weight;
    };
    words.forEach((w, i) => {
      add(`w:${w}`, 1);
      if (i > 0) add(`b:${words[i - 1]} ${w}`, 0.7);
      const padded = `^${w}$`;
      for (let j = 0; j + 3 <= padded.length; j++) add(`c:${padded.slice(j, j + 3)}`, 0.25);
    });
    // An all-zero vector has no cosine distance; give empty text a fixed direction.
    if (!v.some((x) => x !== 0)) v[0] = 1;
    return normalize(v);
  }
}
