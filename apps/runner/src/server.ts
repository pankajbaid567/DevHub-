import { createServer, type IncomingMessage, type Server } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import {
  DEFAULT_LIMITS,
  runCode,
  supportedLanguages,
  type Limits,
  type RunLanguage,
} from './sandbox.js';

export interface RunnerOptions {
  token: string;
  /** Programs executing at once; the rest wait in a bounded queue. */
  concurrency: number;
  maxQueue: number;
  limits?: Limits;
}

const MAX_BODY = 200 * 1024;
const MAX_CODE = 64 * 1024;
const MAX_STDIN = 16 * 1024;

/** A counting semaphore with a bounded wait queue (back-pressure instead of overload). */
export class Semaphore {
  private active = 0;
  private readonly waiting: (() => void)[] = [];
  constructor(
    private readonly max: number,
    private readonly maxQueue: number,
  ) {}

  async acquire(): Promise<boolean> {
    if (this.active < this.max) {
      this.active++;
      return true;
    }
    if (this.waiting.length >= this.maxQueue) return false;
    await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active++;
    return true;
  }

  release(): void {
    this.active--;
    this.waiting.shift()?.();
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function authorized(req: IncomingMessage, token: string): boolean {
  const given = Buffer.from(String(req.headers.authorization ?? ''));
  const expected = Buffer.from(`Bearer ${token}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Minimal HTTP API: `POST /run` (bearer token), `GET /health`, `GET /languages`.
 * Only the API talks to it, over a Docker network with no route to the internet.
 */
export function createRunnerServer(opts: RunnerOptions): Server {
  const gate = new Semaphore(opts.concurrency, opts.maxQueue);
  const languages = supportedLanguages();

  return createServer(async (req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
    };
    try {
      if (req.method === 'GET' && req.url === '/health') return send(200, { status: 'ok' });
      if (req.method === 'GET' && req.url === '/languages') return send(200, { languages });
      if (req.method !== 'POST' || req.url !== '/run') return send(404, { error: 'not found' });
      if (!authorized(req, opts.token)) return send(401, { error: 'unauthorized' });

      let body: { language?: unknown; code?: unknown; stdin?: unknown };
      try {
        body = JSON.parse(await readBody(req)) as typeof body;
      } catch {
        return send(400, { error: 'invalid JSON or body too large' });
      }
      const { language, code, stdin } = body;
      if (typeof language !== 'string' || !languages.includes(language as RunLanguage))
        return send(400, { error: `language must be one of ${languages.join(', ')}` });
      if (typeof code !== 'string' || code.length > MAX_CODE)
        return send(400, { error: `code must be a string up to ${MAX_CODE} characters` });
      if (stdin !== undefined && (typeof stdin !== 'string' || stdin.length > MAX_STDIN))
        return send(400, { error: `stdin must be a string up to ${MAX_STDIN} characters` });

      if (!(await gate.acquire())) return send(503, { error: 'runner busy, try again' });
      try {
        const result = await runCode(
          {
            language: language as RunLanguage,
            code,
            ...(stdin !== undefined && { stdin: stdin as string }),
          },
          opts.limits ?? DEFAULT_LIMITS,
        );
        send(200, result);
      } finally {
        gate.release();
      }
    } catch (err) {
      send(500, { error: (err as Error).message });
    }
  });
}
