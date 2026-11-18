import type { RunCodeInput, RunStatus } from '@devhub/shared';

export interface RunnerResult {
  status: Exclude<RunStatus, 'failed'>;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
}

/** Strategy for code execution: the HTTP sandbox service, or disabled when unconfigured. */
export interface CodeRunner {
  readonly enabled: boolean;
  run(input: RunCodeInput): Promise<RunnerResult>;
}

export class RunnerUnavailableError extends Error {}

export class HttpCodeRunner implements CodeRunner {
  readonly enabled = true;

  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly http: typeof fetch = fetch,
  ) {}

  async run(input: RunCodeInput): Promise<RunnerResult> {
    let res: Response;
    try {
      res = await this.http(`${this.url.replace(/\/$/, '')}/run`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        // The runner's own wall-clock limit is 5 s; allow for queueing behind other runs.
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      throw new RunnerUnavailableError(`Runner unreachable: ${(err as Error).message}`);
    }
    if (res.status === 503) throw new RunnerUnavailableError('The runner is busy, try again');
    if (!res.ok) throw new RunnerUnavailableError(`Runner error (${res.status})`);
    return (await res.json()) as RunnerResult;
  }
}

export class DisabledCodeRunner implements CodeRunner {
  readonly enabled = false;
  run(): Promise<RunnerResult> {
    return Promise.reject(new RunnerUnavailableError('Code execution is not configured'));
  }
}
