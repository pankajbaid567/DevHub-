import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS, TYPESCRIPT_SUPPORTED, runCode } from '../src/sandbox.js';
import { Semaphore, createRunnerServer } from '../src/server.js';

const fast = { ...DEFAULT_LIMITS, timeoutMs: 1_500, cpuSeconds: 2 };

describe('sandbox', () => {
  it('runs JavaScript and Python with stdin and captures both streams', async () => {
    const js = await runCode({
      language: 'javascript',
      code: 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{console.log(s.trim().toUpperCase());console.error("warn")})',
      stdin: 'hello',
    });
    expect(js).toMatchObject({ status: 'ok', exitCode: 0, stdout: 'HELLO\n', stderr: 'warn\n' });

    const py = await runCode({
      language: 'python',
      code: 'import sys\nprint(sum(int(x) for x in sys.stdin.read().split()))',
      stdin: '1 2 3',
    });
    expect(py).toMatchObject({ status: 'ok', stdout: '6\n' });
  });

  it.runIf(TYPESCRIPT_SUPPORTED)('runs TypeScript by stripping types', async () => {
    const r = await runCode({
      language: 'typescript',
      code: 'const n: number = 21; console.log(n * 2);',
    });
    expect(r).toMatchObject({ status: 'ok', stdout: '42\n' });
  });

  it('reports runtime errors with the exit code', async () => {
    const r = await runCode({ language: 'python', code: 'raise ValueError("boom")' });
    expect(r.status).toBe('error');
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain('ValueError: boom');
  });

  it('kills infinite loops at the wall-clock limit', async () => {
    const r = await runCode({ language: 'javascript', code: 'while(true){}' }, fast);
    expect(r.status).toBe('timeout');
    expect(r.durationMs).toBeLessThan(4_000);
  });

  it('kills child processes the program spawns (process-group kill)', async () => {
    const r = await runCode(
      {
        language: 'python',
        code: 'import subprocess,time\nsubprocess.Popen(["sleep","30"])\ntime.sleep(30)',
      },
      fast,
    );
    expect(r.status).toBe('timeout');
  });

  it('stops output floods at the byte limit', async () => {
    const r = await runCode(
      { language: 'javascript', code: 'for(;;) process.stdout.write("x".repeat(1024))' },
      { ...fast, maxOutputBytes: 8 * 1024 },
    );
    expect(r.status).toBe('output_limit');
    expect(r.stdout.length).toBe(8 * 1024);
  });

  it('does not leak the runner environment (tokens) into user code', async () => {
    process.env.RUNNER_TOKEN = 'super-secret-token';
    const r = await runCode({
      language: 'python',
      code: 'import os\nprint(sorted(os.environ.keys()))',
    });
    expect(r.stdout).not.toContain('RUNNER_TOKEN');
    expect(r.stdout).not.toContain('super-secret');
  });

  it('uses a fresh, removed working directory per run', async () => {
    const a = await runCode({
      language: 'python',
      code: 'open("x.txt","w").write("1")\nimport os\nprint(os.getcwd())',
    });
    const b = await runCode({
      language: 'python',
      code: 'import os\nprint(os.path.exists("x.txt"))',
    });
    expect(b.stdout.trim()).toBe('False');
    const { existsSync } = await import('node:fs');
    expect(existsSync(a.stdout.trim())).toBe(false);
  });
});

describe('semaphore', () => {
  it('bounds concurrency and rejects when the queue is full', async () => {
    const s = new Semaphore(1, 1);
    expect(await s.acquire()).toBe(true);
    const queued = s.acquire();
    expect(await s.acquire()).toBe(false); // queue full: back-pressure
    s.release();
    expect(await queued).toBe(true);
  });
});

describe('HTTP API', () => {
  const token = 'test-token-0123456789';
  const server = createRunnerServer({ token, concurrency: 2, maxQueue: 2, limits: fast });
  let base = '';
  beforeAll(async () => {
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const run = (body: unknown, auth = `Bearer ${token}`) =>
    fetch(`${base}/run`, {
      method: 'POST',
      headers: { Authorization: auth },
      body: JSON.stringify(body),
    });

  it('requires the bearer token', async () => {
    expect((await run({ language: 'python', code: 'print(1)' }, 'Bearer wrong')).status).toBe(401);
  });

  it('validates the request', async () => {
    expect((await run({ language: 'cobol', code: '' })).status).toBe(400);
    expect((await run({ language: 'python', code: 'x'.repeat(70_000) })).status).toBe(400);
  });

  it('runs code', async () => {
    const res = await run({ language: 'python', code: 'print("hi")' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok', stdout: 'hi\n' });
  });
});
