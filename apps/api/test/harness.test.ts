import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { INTERVIEW_PROBLEMS, type RunnableProblemLanguage } from '@devhub/shared';
import { buildHarness, parseHarnessOutput } from '../src/modules/interviews/harness.js';
import { outputsMatch, PROBLEM_SUITES } from '../src/modules/interviews/problem-tests.js';

/**
 * Runs generated harnesses with real interpreters (the sandbox only adds limits around the
 * same commands), so the drivers are proven against actual JavaScript, TypeScript and Python.
 */
const run = promisify(execFile);
const [major, minor] = process.versions.node.split('.').map(Number) as [number, number];
const TS = major > 22 || (major === 22 && minor >= 6);
const hasPython = await run('python3', ['--version']).then(
  () => true,
  () => false,
);

async function execute(language: RunnableProblemLanguage, code: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'harness-'));
  const file = join(
    dir,
    { javascript: 'main.js', typescript: 'main.ts', python: 'main.py' }[language],
  );
  await writeFile(file, code);
  try {
    const [cmd, args] =
      language === 'python'
        ? ['python3', ['-I', '-B', file]]
        : language === 'typescript'
          ? [process.execPath, ['--experimental-strip-types', '--no-warnings', file]]
          : [process.execPath, [file]];
    const { stdout } = await run(cmd, args, { timeout: 15_000, maxBuffer: 8 << 20 });
    return stdout;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function check(slug: string, language: RunnableProblemLanguage, solution: string) {
  const problem = INTERVIEW_PROBLEMS.find((p) => p.slug === slug)!;
  const suite = PROBLEM_SUITES[slug]!;
  const entry = language === 'python' ? problem.entry.python : problem.entry.javascript;
  const h = buildHarness(
    language,
    suite.kind,
    entry,
    suite.cases.map((c) => c.input),
    solution,
  );
  const { outputs, printed } = parseHarnessOutput(await execute(language, h.code), h.marker);
  expect(outputs, printed).not.toBeNull();
  return suite.cases.map((c, i) => {
    const o = outputs![i]!;
    return o.ok && outputsMatch(suite.compare, o.value, c.expected)
      ? 'pass'
      : o.ok
        ? 'fail'
        : o.error;
  });
}

const JS: Record<string, string> = {
  'two-sum': `function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    if (seen.has(target - nums[i])) return [i, seen.get(target - nums[i])]; // reversed order is fine
    seen.set(nums[i], i);
  }
}`,
  'valid-parentheses': `function isValid(s) {
  const st = [], m = { ')': '(', ']': '[', '}': '{' };
  for (const c of s) { if (m[c]) { if (st.pop() !== m[c]) return false; } else st.push(c); }
  return st.length === 0;
}`,
  'merge-intervals': `function merge(iv) {
  iv.sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [s, e] of iv) {
    if (out.length && s <= out[out.length - 1][1]) out[out.length - 1][1] = Math.max(out[out.length - 1][1], e);
    else out.push([s, e]);
  }
  return out;
}`,
  'lru-cache': `class LRUCache {
  constructor(c) { this.c = c; this.m = new Map(); }
  get(k) { if (!this.m.has(k)) return -1; const v = this.m.get(k); this.m.delete(k); this.m.set(k, v); return v; }
  put(k, v) { this.m.delete(k); this.m.set(k, v); if (this.m.size > this.c) this.m.delete(this.m.keys().next().value); }
}`,
  'rate-limiter': `class RateLimiter {
  constructor(limit, w) { this.limit = limit; this.w = w; this.log = new Map(); }
  allow(u, now) {
    const r = (this.log.get(u) || []).filter((t) => t > now - this.w);
    if (r.length >= this.limit) { this.log.set(u, r); return false; }
    r.push(now); this.log.set(u, r); return true;
  }
}`,
  'top-k-frequent': `function topKFrequent(words, k) {
  const c = new Map();
  for (const w of words) c.set(w, (c.get(w) || 0) + 1);
  return [...c.keys()].sort((a, b) => c.get(b) - c.get(a) || (a < b ? -1 : 1)).slice(0, k);
}`,
};

const PY: Record<string, string> = {
  'two-sum': `def two_sum(nums, target):
    seen = {}
    for i, n in enumerate(nums):
        if target - n in seen:
            return [seen[target - n], i]
        seen[n] = i`,
  'valid-parentheses': `def is_valid(s):
    st, m = [], {')': '(', ']': '[', '}': '{'}
    for c in s:
        if c in m:
            if not st or st.pop() != m[c]:
                return False
        else:
            st.append(c)
    return not st`,
  'merge-intervals': `def merge(intervals):
    out = []
    for s, e in sorted(intervals):
        if out and s <= out[-1][1]:
            out[-1][1] = max(out[-1][1], e)
        else:
            out.append([s, e])
    return out`,
  'lru-cache': `from collections import OrderedDict
class LRUCache:
    def __init__(self, capacity):
        self.c, self.d = capacity, OrderedDict()
    def get(self, key):
        if key not in self.d:
            return -1
        self.d.move_to_end(key)
        return self.d[key]
    def put(self, key, value):
        self.d[key] = value
        self.d.move_to_end(key)
        if len(self.d) > self.c:
            self.d.popitem(last=False)`,
  'rate-limiter': `class RateLimiter:
    def __init__(self, limit, window_seconds):
        self.limit, self.w, self.log = limit, window_seconds, {}
    def allow(self, user_id, now):
        r = [t for t in self.log.get(user_id, []) if t > now - self.w]
        if len(r) >= self.limit:
            self.log[user_id] = r
            return False
        r.append(now)
        self.log[user_id] = r
        return True`,
  'top-k-frequent': `from collections import Counter
def top_k_frequent(words, k):
    c = Counter(words)
    return sorted(c, key=lambda w: (-c[w], w))[:k]`,
};

describe('problem suites', () => {
  it('every bank problem has a suite with visible and hidden tests', () => {
    for (const p of INTERVIEW_PROBLEMS) {
      const suite = PROBLEM_SUITES[p.slug];
      expect(suite, p.slug).toBeDefined();
      expect(suite!.kind).toBe(p.kind);
      expect(suite!.cases.some((c) => !c.hidden)).toBe(true);
      expect(suite!.cases.filter((c) => c.hidden).length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('test harness with real interpreters', () => {
  for (const slug of Object.keys(JS)) {
    it(`${slug}: correct JavaScript passes every test`, async () => {
      expect(new Set(await check(slug, 'javascript', JS[slug]!))).toEqual(new Set(['pass']));
    });
    it.skipIf(!hasPython)(`${slug}: correct Python passes every test`, async () => {
      expect(new Set(await check(slug, 'python', PY[slug]!))).toEqual(new Set(['pass']));
    });
  }

  it.skipIf(!TS)('runs TypeScript with type annotations', async () => {
    const ts = `function isValid(s: string): boolean {
  const st: string[] = [];
  const m: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  for (const c of s) { if (m[c]) { if (st.pop() !== m[c]) return false; } else st.push(c); }
  return st.length === 0;
}`;
    expect(new Set(await check('valid-parentheses', 'typescript', ts))).toEqual(new Set(['pass']));
  });

  it('reports wrong answers and per-test exceptions without losing the other results', async () => {
    const results = await check(
      'valid-parentheses',
      'javascript',
      `function isValid(s) { if (s.length > 100) throw new RangeError('too long'); return s.length % 2 === 0; }`,
    );
    expect(results).toContain('pass');
    expect(results).toContain('fail');
    expect(results.at(-1)).toBe('RangeError: too long');

    const py = await check(
      'two-sum',
      'python',
      `def two_sum(nums, target):\n    return nums[10**9]`,
    );
    expect(py.every((r) => r === 'IndexError: list index out of range')).toBe(true);
  });

  it("keeps the solution's own output apart from the results, even if it fakes the format", async () => {
    const problem = INTERVIEW_PROBLEMS.find((p) => p.slug === 'two-sum')!;
    const suite = PROBLEM_SUITES['two-sum']!;
    const forged = `console.log('__DEVHUB_RESULTS_0000000000000000__' + JSON.stringify([{ ok: true, value: [0, 1] }]));
function twoSum() { console.log('debug line'); return [0, 0]; }`;
    const h = buildHarness(
      'javascript',
      'function',
      problem.entry.javascript,
      suite.cases.map((c) => c.input),
      forged,
    );
    const { printed, outputs } = parseHarnessOutput(await execute('javascript', h.code), h.marker);
    expect(printed).toContain('debug line');
    expect(outputs).toHaveLength(suite.cases.length); // the real results, not the forged single one
  });

  it('a missing function fails every test with a clear error', async () => {
    const results = await check('merge-intervals', 'javascript', '// nothing yet');
    expect(results.every((r) => r === 'ReferenceError: merge is not defined')).toBe(true);
  });
});
