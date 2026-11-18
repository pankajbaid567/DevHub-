import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type RunLanguage = 'javascript' | 'typescript' | 'python';

export interface RunRequest {
  language: RunLanguage;
  code: string;
  stdin?: string;
}

export interface RunResult {
  language: RunLanguage;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  status: 'ok' | 'error' | 'timeout' | 'output_limit';
  durationMs: number;
}

export interface Limits {
  /** Wall-clock limit; the whole process group is killed when it passes. */
  timeoutMs: number;
  /** CPU seconds (ulimit -t), a second line of defence against busy loops. */
  cpuSeconds: number;
  /** Address-space limit for Python (ulimit -v); V8 is capped with --max-old-space-size. */
  memoryMb: number;
  /** Bytes kept per stream; more output kills the program. */
  maxOutputBytes: number;
  /**
   * Per-user process/thread cap (ulimit -u) that stops fork bombs. It counts every task of
   * the sandbox user, so it is only set where the runner owns that user (the container).
   */
  maxProcesses?: number;
}

export const DEFAULT_LIMITS: Limits = {
  timeoutMs: 5_000,
  cpuSeconds: 5,
  memoryMb: 256,
  maxOutputBytes: 64 * 1024,
  ...(process.env.RUNNER_MAX_PROCS && { maxProcesses: Number(process.env.RUNNER_MAX_PROCS) }),
};

const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
/** Node strips TypeScript types natively from 22.6 (no compiler in the sandbox). */
export const TYPESCRIPT_SUPPORTED = major > 22 || (major === 22 && minor >= 6);

interface LanguageSpec {
  file: string;
  command(file: string, limits: Limits): string[];
  /** Apply an address-space ulimit (unsafe for V8, which reserves large virtual ranges). */
  limitAddressSpace: boolean;
}

const LANGUAGES: Record<RunLanguage, LanguageSpec> = {
  javascript: {
    file: 'main.js',
    command: (f, l) => ['node', `--max-old-space-size=${Math.floor(l.memoryMb / 2)}`, f],
    limitAddressSpace: false,
  },
  typescript: {
    file: 'main.ts',
    command: (f, l) => [
      'node',
      '--experimental-strip-types',
      '--no-warnings',
      `--max-old-space-size=${Math.floor(l.memoryMb / 2)}`,
      f,
    ],
    limitAddressSpace: false,
  },
  python: {
    file: 'main.py',
    // -I: isolated mode (ignores env vars and the user site dir), -B: no .pyc writes.
    command: (f) => ['python3', '-I', '-B', f],
    limitAddressSpace: true,
  },
};

export function supportedLanguages(): RunLanguage[] {
  return (Object.keys(LANGUAGES) as RunLanguage[]).filter(
    (l) => l !== 'typescript' || TYPESCRIPT_SUPPORTED,
  );
}

/**
 * Runs untrusted code in a fresh temporary directory with a scrubbed environment,
 * resource limits and a hard wall-clock kill of the whole process group.
 *
 * This is the *inner* layer. The outer layer is the container (see Dockerfile and
 * docker-compose.yml): no network, read-only root filesystem, all capabilities dropped,
 * non-root user, memory/CPU/pids limits. For hostile multi-tenant production traffic, run
 * that container under gVisor (`runtime: runsc`) or Firecracker as a third layer.
 */
export async function runCode(
  req: RunRequest,
  limits: Limits = DEFAULT_LIMITS,
): Promise<RunResult> {
  const spec = LANGUAGES[req.language];
  const dir = await mkdtemp(join(tmpdir(), 'run-'));
  const started = performance.now();
  try {
    const file = join(dir, spec.file);
    await writeFile(file, req.code, { mode: 0o600 });

    const ulimits = [
      'ulimit -c 0', // no core dumps
      `ulimit -t ${limits.cpuSeconds}`,
      'ulimit -f 2048', // files up to 1 MB (512-byte blocks)
      ...(spec.limitAddressSpace ? [`ulimit -v ${limits.memoryMb * 1024}`] : []),
      ...(limits.maxProcesses ? [`ulimit -u ${limits.maxProcesses}`] : []),
    ]
      .map((c) => `${c} 2>/dev/null`)
      .join('; ');
    const child = spawn(
      '/bin/sh',
      ['-c', `${ulimits}; exec "$@"`, 'sh', ...spec.command(file, limits)],
      {
        cwd: dir,
        // Nothing from the runner's own environment (tokens, paths) leaks into user code.
        env: {
          PATH: '/usr/local/bin:/usr/bin:/bin',
          HOME: dir,
          LANG: 'C.UTF-8',
          PYTHONIOENCODING: 'utf-8',
        },
        detached: true, // own process group, so children it forks are killed too
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );

    let status: RunResult['status'] = 'ok';
    const killGroup = () => {
      try {
        process.kill(-child.pid!, 'SIGKILL');
      } catch {
        /* already gone */
      }
    };
    const collect = (stream: NodeJS.ReadableStream) => {
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on('data', (chunk: Buffer) => {
        if (size >= limits.maxOutputBytes) return;
        const room = limits.maxOutputBytes - size;
        chunks.push(chunk.subarray(0, room));
        size += Math.min(room, chunk.length);
        if (size >= limits.maxOutputBytes) {
          status = 'output_limit';
          killGroup();
        }
      });
      return () => Buffer.concat(chunks).toString('utf8');
    };
    const stdout = collect(child.stdout!);
    const stderr = collect(child.stderr!);
    child.stdin!.on('error', () => {}); // program may exit before reading stdin
    child.stdin!.end(req.stdin ?? '');

    const timer = setTimeout(() => {
      status = 'timeout';
      killGroup();
    }, limits.timeoutMs);

    const { code, signal } = await new Promise<{ code: number | null; signal: string | null }>(
      (resolve, reject) => {
        child.on('error', reject);
        child.on('close', (c, s) => resolve({ code: c, signal: s }));
      },
    );
    clearTimeout(timer);
    // Kill the group a few times: a fork bomb can create processes while the first kill runs.
    for (let i = 0; i < 3; i++) {
      killGroup();
      await new Promise((r) => setTimeout(r, 20));
    }

    if (status === 'ok' && code !== 0) status = 'error';
    return {
      language: req.language,
      stdout: stdout(),
      stderr: stderr(),
      exitCode: code,
      signal,
      status,
      durationMs: Math.round(performance.now() - started),
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
