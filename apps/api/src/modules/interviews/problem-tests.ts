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
  /** JS/TS code injected before the user's solution — TreeNode class, deserializers, etc. */
  preamble?: { javascript: string; python: string };
  /** Override the entry function name for this suite (wrapper defined in preamble). */
  entryOverride?: { javascript: string; python: string };
}

export const TREE_PREAMBLE = {
  javascript: `class TreeNode { constructor(val, left, right) { this.val = val ?? 0; this.left = left ?? null; this.right = right ?? null; } }
function __buildTree(arr) { if (!arr || !arr.length) return null; const root = new TreeNode(arr[0]); const q = [root]; let i = 1; while (i < arr.length) { const n = q.shift(); if (i < arr.length && arr[i] != null) { n.left = new TreeNode(arr[i]); q.push(n.left); } i++; if (i < arr.length && arr[i] != null) { n.right = new TreeNode(arr[i]); q.push(n.right); } i++; } return root; }
function __serializeTree(root) { if (!root) return []; const res = []; const q = [root]; while (q.length) { const n = q.shift(); if (n) { res.push(n.val); q.push(n.left); q.push(n.right); } else res.push(null); } while (res.length && res[res.length-1] === null) res.pop(); return res; }`,
  python: `class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val; self.left = left; self.right = right
def __build_tree(arr):
    if not arr: return None
    from collections import deque
    root = TreeNode(arr[0]); q = deque([root]); i = 1
    while i < len(arr):
        n = q.popleft()
        if i < len(arr) and arr[i] is not None:
            n.left = TreeNode(arr[i]); q.append(n.left)
        i += 1
        if i < len(arr) and arr[i] is not None:
            n.right = TreeNode(arr[i]); q.append(n.right)
        i += 1
    return root
def __serialize_tree(root):
    if not root: return []
    from collections import deque
    res = []; q = deque([root])
    while q:
        n = q.popleft()
        if n:
            res.append(n.val); q.append(n.left); q.append(n.right)
        else:
            res.append(None)
    while res and res[-1] is None: res.pop()
    return res
`,
};

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

// ------------------------------------------------------------------ new reference solutions

function reverseList(head: unknown[]): unknown[] {
  let prev: unknown[] = [];
  let curr = head;
  while (curr.length) {
    const next = curr[1] as unknown[];
    curr[1] = prev;
    prev = curr;
    curr = next ?? [];
  }
  return prev;
}

function maxSubArray(nums: number[]): number {
  let max = nums[0]!;
  let cur = nums[0]!;
  for (let i = 1; i < nums.length; i++) {
    cur = Math.max(nums[i]!, cur + nums[i]!);
    max = Math.max(max, cur);
  }
  return max;
}

function binarySearch(nums: number[], target: number): number {
  let lo = 0, hi = nums.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (nums[mid] === target) return mid;
    if (nums[mid]! < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

function maxProfit(prices: number[]): number {
  let min = Infinity, max = 0;
  for (const p of prices) {
    if (p < min) min = p;
    else if (p - min > max) max = p - min;
  }
  return max;
}

function climbStairs(n: number): number {
  let a = 1, b = 1;
  for (let i = 2; i <= n; i++) [a, b] = [b, a + b];
  return b;
}

function productExceptSelf(nums: number[]): number[] {
  const n = nums.length;
  const out = new Array(n).fill(1);
  let left = 1;
  for (let i = 0; i < n; i++) { out[i] = left; left *= nums[i]!; }
  let right = 1;
  for (let i = n - 1; i >= 0; i--) { out[i] *= right; right *= nums[i]!; }
  return out;
}

function lengthOfLongestSubstring(s: string): number {
  const seen = new Map<string, number>();
  let max = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    if (seen.has(s[i]!) && seen.get(s[i]!)! >= start) start = seen.get(s[i]!)! + 1;
    seen.set(s[i]!, i);
    max = Math.max(max, i - start + 1);
  }
  return max;
}

function threeSum(nums: number[]): number[][] {
  nums.sort((a, b) => a - b);
  const res: number[][] = [];
  for (let i = 0; i < nums.length - 2; i++) {
    if (i > 0 && nums[i] === nums[i - 1]) continue;
    let lo = i + 1, hi = nums.length - 1;
    while (lo < hi) {
      const sum = nums[i]! + nums[lo]! + nums[hi]!;
      if (sum === 0) {
        res.push([nums[i]!, nums[lo]!, nums[hi]!]);
        while (lo < hi && nums[lo] === nums[lo + 1]) lo++;
        while (lo < hi && nums[hi] === nums[hi - 1]) hi--;
        lo++; hi--;
      } else if (sum < 0) lo++;
      else hi--;
    }
  }
  return res;
}

function coinChange(coins: number[], amount: number): number {
  const dp = new Array(amount + 1).fill(Infinity);
  dp[0] = 0;
  for (const c of coins) {
    for (let i = c; i <= amount; i++) dp[i] = Math.min(dp[i], dp[i - c] + 1);
  }
  return dp[amount] === Infinity ? -1 : dp[amount];
}

function numIslands(grid: string[][]): number {
  const m = grid.length, n = grid[0]!.length;
  let count = 0;
  const dfs = (i: number, j: number) => {
    if (i < 0 || j < 0 || i >= m || j >= n || grid[i]![j] !== '1') return;
    grid[i]![j] = '0';
    dfs(i - 1, j); dfs(i + 1, j); dfs(i, j - 1); dfs(i, j + 1);
  };
  for (let i = 0; i < m; i++)
    for (let j = 0; j < n; j++)
      if (grid[i]![j] === '1') { count++; dfs(i, j); }
  return count;
}

function groupAnagrams(strs: string[]): string[][] {
  const map = new Map<string, string[]>();
  for (const s of strs) {
    const key = [...s].sort().join('');
    (map.get(key) ?? (map.set(key, []), map.get(key)!)).push(s);
  }
  return [...map.values()].sort((a, b) => a[0]!.localeCompare(b[0]!));
}

function containerWithMostWater(height: number[]): number {
  let lo = 0, hi = height.length - 1, max = 0;
  while (lo < hi) {
    max = Math.max(max, Math.min(height[lo]!, height[hi]!) * (hi - lo));
    if (height[lo]! < height[hi]!) lo++; else hi--;
  }
  return max;
}

function longestIncreasingSubseq(nums: number[]): number {
  const tails: number[] = [];
  for (const n of nums) {
    let lo = 0, hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid]! < n) lo = mid + 1; else hi = mid;
    }
    tails[lo] = n;
  }
  return tails.length;
}

function kthLargest(nums: number[], k: number): number {
  return nums.sort((a, b) => b - a)[k - 1]!;
}

function wordBreak(s: string, wordDict: string[]): boolean {
  const set = new Set(wordDict);
  const dp = new Array(s.length + 1).fill(false);
  dp[0] = true;
  for (let i = 1; i <= s.length; i++) {
    for (let j = 0; j < i; j++) {
      if (dp[j] && set.has(s.slice(j, i))) { dp[i] = true; break; }
    }
  }
  return dp[s.length];
}

function medianOfTwoSorted(nums1: number[], nums2: number[]): number {
  const merged = [...nums1, ...nums2].sort((a, b) => a - b);
  const n = merged.length;
  if (n % 2 === 1) return merged[(n - 1) / 2]!;
  return (merged[n / 2 - 1]! + merged[n / 2]!) / 2;
}

function longestPalindrome(s: string): string {
  let start = 0, maxLen = 1;
  const expand = (l: number, r: number) => {
    while (l >= 0 && r < s.length && s[l] === s[r]) { l--; r++; }
    if (r - l - 1 > maxLen) { start = l + 1; maxLen = r - l - 1; }
  };
  for (let i = 0; i < s.length; i++) { expand(i, i); expand(i, i + 1); }
  return s.slice(start, start + maxLen);
}

function minWindow(s: string, t: string): string {
  const need = new Map<string, number>();
  for (const c of t) need.set(c, (need.get(c) ?? 0) + 1);
  let have = 0, formed = need.size;
  let l = 0, minLen = Infinity, minStart = 0;
  const win = new Map<string, number>();
  for (let r = 0; r < s.length; r++) {
    const c = s[r]!;
    win.set(c, (win.get(c) ?? 0) + 1);
    if (need.has(c) && win.get(c) === need.get(c)) have++;
    while (have === formed) {
      if (r - l + 1 < minLen) { minLen = r - l + 1; minStart = l; }
      const lc = s[l]!;
      win.set(lc, win.get(lc)! - 1);
      if (need.has(lc) && win.get(lc)! < need.get(lc)!) have--;
      l++;
    }
  }
  return minLen === Infinity ? '' : s.slice(minStart, minStart + minLen);
}

function canFinish(numCourses: number, prerequisites: number[][]): boolean {
  const graph: number[][] = Array.from({ length: numCourses }, () => []);
  const inDeg = new Array(numCourses).fill(0);
  for (const [a, b] of prerequisites) { graph[b!]!.push(a!); inDeg[a!]++; }
  const q = inDeg.flatMap((d, i) => d === 0 ? [i] : []);
  let count = 0;
  while (q.length) {
    const n = q.shift()!;
    count++;
    for (const nb of graph[n]!) {
      inDeg[nb]--;
      if (inDeg[nb] === 0) q.push(nb);
    }
  }
  return count === numCourses;
}

function trap(height: number[]): number {
  let lo = 0, hi = height.length - 1, lmax = 0, rmax = 0, water = 0;
  while (lo < hi) {
    if (height[lo]! < height[hi]!) {
      lmax = Math.max(lmax, height[lo]!);
      water += lmax - height[lo]!;
      lo++;
    } else {
      rmax = Math.max(rmax, height[hi]!);
      water += rmax - height[hi]!;
      hi--;
    }
  }
  return water;
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

// New problem suites
Object.assign(PROBLEM_SUITES, {
  'reverse-linked-list': {
    kind: 'function',
    compare: 'exact',
    cases: [
      { input: [[1, [2, [3, [4, [5, []]]]]]], expected: [5, [4, [3, [2, [1, []]]]]], hidden: false },
      { input: [[1, [2, []]]], expected: [2, [1, []]], hidden: false },
      { input: [[]], expected: [], hidden: true },
    ],
  },
  'max-subarray': {
    kind: 'function',
    compare: 'exact',
    cases: fn(maxSubArray, [
      [[[-2, 1, -3, 4, -1, 2, 1, -5, 4]], false],
      [[[1]], false],
      [[[5, 4, -1, 7, 8]], true],
      [[[-1]], true],
      [[[-2, -3, -1, -5]], true],
    ]),
  },
  'binary-search': {
    kind: 'function',
    compare: 'exact',
    cases: fn(binarySearch, [
      [[[-1, 0, 3, 5, 9, 12], 9], false],
      [[[-1, 0, 3, 5, 9, 12], 2], false],
      [[[1], 1], true],
      [[[1, 2, 3, 4, 5], 6], true],
      [[Array.from({ length: 10000 }, (_, i) => i), 9999], true],
    ]),
  },
  'best-time-to-buy-sell-stock': {
    kind: 'function',
    compare: 'exact',
    cases: fn(maxProfit, [
      [[[7, 1, 5, 3, 6, 4]], false],
      [[[7, 6, 4, 3, 1]], false],
      [[[2, 4, 1]], true],
      [[[1]], true],
      [[[3, 3, 3, 3]], true],
    ]),
  },
  'climbing-stairs': {
    kind: 'function',
    compare: 'exact',
    cases: fn(climbStairs, [
      [[2], false],
      [[3], false],
      [[1], true],
      [[10], true],
      [[45], true],
    ]),
  },
  'product-of-array-except-self': {
    kind: 'function',
    compare: 'exact',
    cases: fn(productExceptSelf, [
      [[[1, 2, 3, 4]], false],
      [[[-1, 1, 0, -3, 3]], false],
      [[[2, 2, 2, 2]], true],
      [[[0, 0]], true],
    ]),
  },
  'longest-substring-without-repeating': {
    kind: 'function',
    compare: 'exact',
    cases: fn(lengthOfLongestSubstring, [
      [['abcabcbb'], false],
      [['bbbbb'], false],
      [['pwwkew'], true],
      [[''], true],
      [['abcdefg'], true],
    ]),
  },
  'three-sum': {
    kind: 'function',
    compare: 'exact',
    cases: fn(threeSum, [
      [[[-1, 0, 1, 2, -1, -4]], false],
      [[[0, 1, 1]], false],
      [[[0, 0, 0]], true],
      [[[-2, 0, 1, 1, 2]], true],
    ]),
  },
  'coin-change': {
    kind: 'function',
    compare: 'exact',
    cases: fn(coinChange, [
      [[[1, 5, 10, 25], 30], false],
      [[[2], 3], false],
      [[[1], 0], true],
      [[[1, 2, 5], 11], true],
      [[[186, 419, 83, 408], 6249], true],
    ]),
  },
  'number-of-islands': {
    kind: 'function',
    compare: 'exact',
    cases: [
      {
        input: [[['1','1','1','1','0'],['1','1','0','1','0'],['1','1','0','0','0'],['0','0','0','0','0']]],
        expected: 1,
        hidden: false,
      },
      {
        input: [[['1','1','0','0','0'],['1','1','0','0','0'],['0','0','1','0','0'],['0','0','0','1','1']]],
        expected: 3,
        hidden: false,
      },
      {
        input: [[['1','0','1','0','1'],['0','1','0','1','0'],['1','0','1','0','1']]],
        expected: 8,
        hidden: true,
      },
    ],
  },
  'group-anagrams': {
    kind: 'function',
    compare: 'exact',
    cases: fn(groupAnagrams, [
      [[['eat', 'tea', 'tan', 'ate', 'nat', 'bat']], false],
      [[['']], false],
      [[['a']], true],
      [[['abc', 'bca', 'cab', 'xyz', 'zyx']], true],
    ]),
  },
  'container-with-most-water': {
    kind: 'function',
    compare: 'exact',
    cases: fn(containerWithMostWater, [
      [[[1, 8, 6, 2, 5, 4, 8, 3, 7]], false],
      [[[1, 1]], false],
      [[[4, 3, 2, 1, 4]], true],
      [[[1, 2, 1]], true],
    ]),
  },
  'longest-increasing-subsequence': {
    kind: 'function',
    compare: 'exact',
    cases: fn(longestIncreasingSubseq, [
      [[[10, 9, 2, 5, 3, 7, 101, 18]], false],
      [[[0, 1, 0, 3, 2, 3]], false],
      [[[7, 7, 7, 7]], true],
      [[[1, 3, 6, 7, 9, 4, 10, 5, 6]], true],
    ]),
  },
  'kth-largest-element': {
    kind: 'function',
    compare: 'exact',
    cases: fn(kthLargest, [
      [[[3, 2, 1, 5, 6, 4], 2], false],
      [[[3, 2, 3, 1, 2, 4, 5, 5, 6], 4], false],
      [[[1], 1], true],
      [[[7, 6, 5, 4, 3, 2, 1], 5], true],
    ]),
  },
  'trapping-rain-water': {
    kind: 'function',
    compare: 'exact',
    cases: fn(trap, [
      [[[0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1]], false],
      [[[4, 2, 0, 3, 2, 5]], false],
      [[[1, 2, 3, 4, 5]], true],
      [[[5, 4, 3, 2, 1]], true],
      [[[3, 0, 2, 0, 4]], true],
    ]),
  },
  'word-break': {
    kind: 'function',
    compare: 'exact',
    cases: fn(wordBreak, [
      [['leetcode', ['leet', 'code']], false],
      [['applepenapple', ['apple', 'pen']], false],
      [['catsandog', ['cats', 'dog', 'sand', 'and', 'cat']], true],
      [['a', ['a']], true],
      [['aaaaaaa', ['aaa', 'aaaa']], true],
    ]),
  },
  'median-of-two-sorted-arrays': {
    kind: 'function',
    compare: 'exact',
    cases: fn(medianOfTwoSorted, [
      [[[1, 3], [2]], false],
      [[[1, 2], [3, 4]], false],
      [[[0, 0], [0, 0]], true],
      [[[], [1]], true],
      [[[1, 2, 3, 4, 5], [6, 7, 8, 9, 10]], true],
    ]),
  },
  'longest-palindromic-substring': {
    kind: 'function',
    compare: 'exact',
    cases: fn(longestPalindrome, [
      [['babad'], false],
      [['cbbd'], false],
      [['a'], true],
      [['racecar'], true],
      [['aacabdkacaa'], true],
    ]),
  },
  'minimum-window-substring': {
    kind: 'function',
    compare: 'exact',
    cases: fn(minWindow, [
      [['ADOBECODEBANC', 'ABC'], false],
      [['a', 'a'], false],
      [['a', 'aa'], true],
      [['aa', 'aa'], true],
    ]),
  },
  'course-schedule': {
    kind: 'function',
    compare: 'exact',
    cases: fn(canFinish, [
      [[2, [[1, 0]]], false],
      [[2, [[1, 0], [0, 1]]], false],
      [[4, [[1, 0], [2, 1], [3, 2]]], true],
      [[1, []], true],
      [[3, [[0, 1], [0, 2], [1, 2]]], true],
    ]),
  },
  'validate-bst': {
    kind: 'function',
    compare: 'exact',
    preamble: {
      javascript: TREE_PREAMBLE.javascript + `\nfunction __wrappedIsValidBST(arr) { return isValidBST(__buildTree(arr)); }`,
      python: TREE_PREAMBLE.python + `\ndef __wrapped_is_valid_bst(arr):\n    return is_valid_bst(__build_tree(arr))\n`,
    },
    entryOverride: { javascript: '__wrappedIsValidBST', python: '__wrapped_is_valid_bst' },
    cases: [
      { input: [[2, 1, 3]], expected: true, hidden: false },
      { input: [[5, 1, 4, null, null, 3, 6]], expected: false, hidden: false },
      { input: [[1]], expected: true, hidden: true },
      { input: [[5, 4, 6, null, null, 3, 7]], expected: false, hidden: true },
      { input: [[2, 2, 2]], expected: false, hidden: true },
    ],
  },
  'level-order-traversal': {
    kind: 'function',
    compare: 'exact',
    preamble: {
      javascript: TREE_PREAMBLE.javascript + `\nfunction __wrappedLevelOrder(arr) { return levelOrder(__buildTree(arr)); }`,
      python: TREE_PREAMBLE.python + `\ndef __wrapped_level_order(arr):\n    return level_order(__build_tree(arr))\n`,
    },
    entryOverride: { javascript: '__wrappedLevelOrder', python: '__wrapped_level_order' },
    cases: [
      { input: [[3, 9, 20, null, null, 15, 7]], expected: [[3], [9, 20], [15, 7]], hidden: false },
      { input: [[1]], expected: [[1]], hidden: false },
      { input: [[]], expected: [], hidden: true },
      { input: [[1, 2, 3, 4, 5]], expected: [[1], [2, 3], [4, 5]], hidden: true },
    ],
  },
  'serialize-deserialize-binary-tree': {
    kind: 'function',
    compare: 'exact',
    preamble: {
      javascript: TREE_PREAMBLE.javascript + `
function __testRoundtrip(arr) {
  const codec = new Codec();
  const tree = __buildTree(arr);
  const serialized = codec.serialize(tree);
  const deserialized = codec.deserialize(serialized);
  return __serializeTree(deserialized);
}`,
      python: TREE_PREAMBLE.python + `
def __test_roundtrip(arr):
    codec = Codec()
    tree = __build_tree(arr)
    serialized = codec.serialize(tree)
    deserialized = codec.deserialize(serialized)
    return __serialize_tree(deserialized)
`,
    },
    entryOverride: { javascript: '__testRoundtrip', python: '__test_roundtrip' },
    cases: [
      { input: [[1, 2, 3, null, null, 4, 5]], expected: [1, 2, 3, null, null, 4, 5], hidden: false },
      { input: [[]], expected: [], hidden: false },
      { input: [[1]], expected: [1], hidden: true },
      { input: [[1, 2, null, 3, null, 4]], expected: [1, 2, null, 3, null, 4], hidden: true },
    ],
  },
  'implement-trie': {
    kind: 'class',
    compare: 'exact',
    cases: cls(
      class Trie {
        private root: Record<string, any> = {};
        insert(word: string): void {
          let node = this.root;
          for (const c of word) node = node[c] ??= {};
          node['$'] = true;
        }
        search(word: string): boolean {
          let node = this.root;
          for (const c of word) { node = node[c]; if (!node) return false; }
          return node['$'] === true;
        }
        startsWith(prefix: string): boolean {
          let node = this.root;
          for (const c of prefix) { node = node[c]; if (!node) return false; }
          return true;
        }
      },
      [
        [[['Trie'], ['insert', 'apple'], ['search', 'apple'], ['search', 'app'], ['startsWith', 'app'], ['insert', 'app'], ['search', 'app']], false],
        [[['Trie'], ['insert', 'hello'], ['insert', 'help'], ['search', 'hell'], ['startsWith', 'hel'], ['search', 'hello']], true],
        [[['Trie'], ['insert', 'a'], ['search', 'a'], ['startsWith', 'a'], ['search', 'ab']], true],
      ],
    ),
  },
} satisfies Record<string, ProblemSuite>);

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
