/**
 * Test suites for the problem bank. They live only on the server: the shared package ships to
 * the browser, and hidden tests must stay hidden. Expected values are computed by reference
 * implementations below rather than written by hand.
 */

/** A function call's arguments, or for class problems a sequence of [method, ...args] calls (the first is the constructor). */
export type TestInput = unknown[];

export interface TestCase {
  input: TestInput;
  expected: unknown;
  hidden: boolean;
}

export interface ProblemSuite {
  kind: 'function' | 'class';
  /** How outputs are compared: exactly, or ignoring the order of a top-level array. */
  compare: 'exact' | 'unordered';
  cases: TestCase[];
}

// ------------------------------------------------------------------ reference solutions

function twoSum(nums: number[], target: number): number[] {
  const seen = new Map<number, number>();
  for (let i = 0; i < nums.length; i++) {
    const j = seen.get(target - nums[i]!);
    if (j !== undefined) return [j, i];
    seen.set(nums[i]!, i);
  }
  return [];
}

function isValid(s: string): boolean {
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  const stack: string[] = [];
  for (const ch of s) {
    if (ch in pairs) {
      if (stack.pop() !== pairs[ch]) return false;
    } else stack.push(ch);
  }
  return stack.length === 0;
}

function merge(intervals: number[][]): number[][] {
  const sorted = [...intervals].sort((a, b) => a[0]! - b[0]!);
  const out: number[][] = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s! <= last[1]!) last[1] = Math.max(last[1]!, e!);
    else out.push([s!, e!]);
  }
  return out;
}

function topKFrequent(words: string[], k: number): string[] {
  const counts = new Map<string, number>();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  return [...counts.keys()]
    .sort((a, b) => counts.get(b)! - counts.get(a)! || (a < b ? -1 : a > b ? 1 : 0))
    .slice(0, k);
}

class LRUCache {
  private readonly map = new Map<number, number>();
  constructor(private readonly capacity: number) {}
  get(key: number): number {
    if (!this.map.has(key)) return -1;
    const v = this.map.get(key)!;
    this.map.delete(key);
    this.map.set(key, v);
    return v;
  }
  put(key: number, value: number): void {
    this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.capacity) this.map.delete(this.map.keys().next().value!);
  }
}

class RateLimiter {
  private readonly log = new Map<string, number[]>();
  constructor(
    private readonly limit: number,
    private readonly windowSeconds: number,
  ) {}
  allow(userId: string, now: number): boolean {
    const recent = (this.log.get(userId) ?? []).filter((t) => t > now - this.windowSeconds);
    if (recent.length >= this.limit) {
      this.log.set(userId, recent);
      return false;
    }
    recent.push(now);
    this.log.set(userId, recent);
    return true;
  }
}

/** Replays a call sequence against a reference class; the constructor yields null. */
function replay(Ctor: new (...a: never[]) => object, calls: unknown[][]): unknown[] {
  const [ctor, ...rest] = calls as [string, ...unknown[]][];
  const ctorArgs = ctor!.slice(1);
  const obj = new Ctor(...(ctorArgs as never[])) as Record<string, (...a: unknown[]) => unknown>;
  return [null, ...rest.map(([method, ...args]) => obj[method]!(...args) ?? null)];
}

// ------------------------------------------------------------------ deterministic generators

/** Small seeded PRNG (mulberry32) so hidden tests are the same on every server. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bigTwoSum(n: number): [number[], number] {
  const r = rng(7);
  const nums = Array.from({ length: n }, () => Math.floor(r() * 1_000_000));
  // Make exactly one pair hit the target by using a value outside the generated range.
  nums[n - 3] = 2_000_001;
  nums[n - 1] = 2_000_002;
  return [nums, 4_000_003];
}

function lruOps(seed: number, n: number): unknown[][] {
  const r = rng(seed);
  const calls: unknown[][] = [['LRUCache', 3]];
  for (let i = 0; i < n; i++) {
    const key = Math.floor(r() * 6);
    calls.push(r() < 0.5 ? ['get', key] : ['put', key, Math.floor(r() * 100)]);
  }
  return calls;
}

// ------------------------------------------------------------------ suites

const fn = <A extends unknown[]>(f: (...a: A) => unknown, rows: [A, boolean][]): TestCase[] =>
  rows.map(([input, hidden]) => ({ input, expected: f(...structuredClone(input)), hidden }));

const cls = (Ctor: new (...a: never[]) => object, rows: [unknown[][], boolean][]): TestCase[] =>
  rows.map(([calls, hidden]) => ({ input: calls, expected: replay(Ctor, calls), hidden }));

export const PROBLEM_SUITES: Record<string, ProblemSuite> = {
  'two-sum': {
    kind: 'function',
    compare: 'unordered',
    cases: fn(twoSum, [
      [[[2, 7, 11, 15], 9], false],
      [[[3, 2, 4], 6], false],
      [[[3, 3], 6], true],
      [[[-1, -2, -3, -4, -5], -8], true],
      [[[0, 4, 3, 0], 0], true],
      [bigTwoSum(20_000), true],
    ]),
  },
  'valid-parentheses': {
    kind: 'function',
    compare: 'exact',
    cases: fn(isValid, [
      [['()[]{}'], false],
      [['(]'], false],
      [['([)]'], true],
      [['{[]}'], true],
      [[''], true],
      [['((('], true],
      [['())'], true],
      [['{'.repeat(5_000) + '}'.repeat(5_000)], true],
    ]),
  },
  'merge-intervals': {
    kind: 'function',
    compare: 'exact',
    cases: fn(merge, [
      [
        [
          [
            [1, 3],
            [2, 6],
            [8, 10],
            [15, 18],
          ],
        ],
        false,
      ],
      [
        [
          [
            [1, 4],
            [4, 5],
          ],
        ],
        false,
      ],
      [
        [
          [
            [5, 7],
            [1, 2],
            [2, 3],
          ],
        ],
        true,
      ],
      [
        [
          [
            [1, 10],
            [2, 3],
            [4, 5],
          ],
        ],
        true,
      ],
      [[[[3, 3]]], true],
      [[[]], true],
    ]),
  },
  'lru-cache': {
    kind: 'class',
    compare: 'exact',
    cases: cls(LRUCache, [
      [
        [
          ['LRUCache', 2],
          ['put', 1, 1],
          ['put', 2, 2],
          ['get', 1],
          ['put', 3, 3],
          ['get', 2],
          ['put', 4, 4],
          ['get', 1],
          ['get', 3],
          ['get', 4],
        ],
        false,
      ],
      [
        [
          ['LRUCache', 1],
          ['put', 1, 1],
          ['put', 1, 5],
          ['get', 1],
          ['put', 2, 2],
          ['get', 1],
        ],
        true,
      ],
      [lruOps(11, 40), true],
      [lruOps(12, 200), true],
    ]),
  },
  'rate-limiter': {
    kind: 'class',
    compare: 'exact',
    cases: cls(RateLimiter, [
      [
        [
          ['RateLimiter', 2, 10],
          ['allow', 'a', 1],
          ['allow', 'a', 2],
          ['allow', 'a', 3],
          ['allow', 'a', 11],
          ['allow', 'a', 12],
        ],
        false,
      ],
      [
        [
          ['RateLimiter', 1, 5],
          ['allow', 'a', 0],
          ['allow', 'b', 0],
          ['allow', 'a', 4],
          ['allow', 'a', 5],
        ],
        true,
      ],
      [
        // Rejected requests must not extend the window.
        [
          ['RateLimiter', 2, 10],
          ['allow', 'u', 0],
          ['allow', 'u', 9],
          ['allow', 'u', 9],
          ['allow', 'u', 10],
          ['allow', 'u', 15],
          ['allow', 'u', 19],
        ],
        true,
      ],
    ]),
  },
  'top-k-frequent': {
    kind: 'function',
    compare: 'exact',
    cases: fn(topKFrequent, [
      [[['i', 'love', 'leetcode', 'i', 'love', 'coding'], 2], false],
      [[['the', 'day', 'is', 'sunny', 'the', 'the', 'the', 'sunny', 'is', 'is'], 4], false],
      [[['b', 'a', 'c', 'b', 'a'], 2], true],
      [[['x'], 1], true],
      [[['zz', 'aa', 'mm'], 3], true],
    ]),
  },
};

export const hasTests = (slug: string | null | undefined): slug is string =>
  Boolean(slug && PROBLEM_SUITES[slug]);

/** Normalises a value through JSON so JS and Python results compare the same way. */
const canon = (v: unknown): string => JSON.stringify(v === undefined ? null : v);

export function outputsMatch(compare: ProblemSuite['compare'], actual: unknown, expected: unknown) {
  if (compare === 'unordered' && Array.isArray(actual) && Array.isArray(expected)) {
    const sort = (a: unknown[]) => a.map(canon).sort();
    return canon(sort(actual)) === canon(sort(expected));
  }
  return canon(actual) === canon(expected);
}

/** Compact, readable rendering of a test input for the results panel. */
export function describeInput(kind: ProblemSuite['kind'], entry: string, input: TestInput): string {
  const s =
    kind === 'function'
      ? `${entry}(${input.map((a) => JSON.stringify(a)).join(', ')})`
      : (input as unknown[][])
          .map(([m, ...a]) => `${m}(${a.map((x) => JSON.stringify(x)).join(', ')})`)
          .join(' → ');
  return s.length > 300 ? `${s.slice(0, 297)}…` : s;
}
