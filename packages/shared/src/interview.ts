import { z } from 'zod';
import type { UserSummary } from './common.js';

/**
 * Interview mode: a session with a problem statement, a server-kept timer, private
 * interviewer notes and a scorecard, plus an optional AI voice interviewer for practice.
 */

export type Difficulty = 'Easy' | 'Medium' | 'Hard';
export type ProblemCategory = 'dsa' | 'system-design';

export type RunnableProblemLanguage = 'javascript' | 'typescript' | 'python' | 'cpp';

export interface InterviewProblem {
  slug: string;
  title: string;
  difficulty: Difficulty;
  topics: string[];
  category: ProblemCategory;
  /** Markdown. */
  statement: string;
  /** A function called with each test's arguments, or a class driven by a sequence of calls. */
  kind: 'function' | 'class';
  /** The function or class name the tests call, per language (TypeScript uses the JavaScript name). */
  entry: { javascript: string; python: string; cpp: string };
  starter: Record<RunnableProblemLanguage, string>;
  /** Follow-up / conceptual questions the interviewer can ask after the coding part. */
  followUps?: string[];
}

export interface SystemDesignProblem {
  slug: string;
  title: string;
  difficulty: Difficulty;
  topics: string[];
  category: 'system-design';
  /** Markdown problem statement. */
  statement: string;
  /** Key discussion points and expected areas to cover. */
  expectations: string[];
  /** Follow-up questions to probe deeper understanding. */
  followUps: string[];
  /** Whether this problem benefits from whiteboard/diagram (always true for SD). */
  useWhiteboard: boolean;
}

/** A small built-in bank, so an interviewer can start in two clicks. */
export const INTERVIEW_PROBLEMS: readonly InterviewProblem[] = [
  {
    slug: 'two-sum',
    category: 'dsa',
    kind: 'function',
    entry: { javascript: 'twoSum', python: 'two_sum', cpp: 'twoSum' },
    starter: {
      javascript: 'function twoSum(nums, target) {\n  // Return the two indices, e.g. [0, 1]\n}\n',
      typescript:
        'function twoSum(nums: number[], target: number): number[] {\n  // Return the two indices, e.g. [0, 1]\n  return [];\n}\n',
      python: 'def two_sum(nums, target):\n    # Return the two indices, e.g. [0, 1]\n    pass\n',
      cpp: '#include <vector>\n#include <unordered_map>\nusing namespace std;\n\nvector<int> twoSum(vector<int>& nums, int target) {\n    // Return the two indices, e.g. {0, 1}\n    return {};\n}\n',
    },
    title: 'Two Sum',
    difficulty: 'Easy',
    topics: ['arrays', 'hash map'],
    statement: `Given an array of integers \`nums\` and an integer \`target\`, return the indices of the two numbers that add up to \`target\`.

You may assume exactly one solution exists, and you may not use the same element twice.

**Example:** \`nums = [2, 7, 11, 15]\`, \`target = 9\` → \`[0, 1]\`

**Follow-up:** can you do better than O(n²)?`,
    followUps: [
      'What is the time and space complexity of your solution?',
      'Can you solve it in one pass?',
      'What if the array is sorted? Can you do it in O(1) space?',
    ],
  },
  {
    slug: 'valid-parentheses',
    category: 'dsa',
    kind: 'function',
    entry: { javascript: 'isValid', python: 'is_valid', cpp: 'isValid' },
    starter: {
      javascript: 'function isValid(s) {\n  // Return true or false\n}\n',
      typescript: 'function isValid(s: string): boolean {\n  return false;\n}\n',
      python: 'def is_valid(s):\n    # Return True or False\n    pass\n',
      cpp: '#include <string>\n#include <stack>\nusing namespace std;\n\nbool isValid(string s) {\n    // Return true or false\n    return false;\n}\n',
    },
    title: 'Valid Parentheses',
    difficulty: 'Easy',
    topics: ['stack', 'strings'],
    statement: `Given a string containing only \`()[]{}\`, decide whether it is valid: every opening bracket is closed by the same type, in the correct order.

**Examples:** \`"()[]{}"\` → true, \`"(]"\` → false, \`"([)]"\` → false, \`"{[]}"\` → true`,
    followUps: [
      'What data structure did you use and why?',
      'Can you extend this to handle more bracket types?',
      'What about validating HTML tags (nested open/close)?',
    ],
  },
  {
    slug: 'merge-intervals',
    category: 'dsa',
    kind: 'function',
    entry: { javascript: 'merge', python: 'merge', cpp: 'merge' },
    starter: {
      javascript:
        'function merge(intervals) {\n  // Return the merged intervals, sorted by start\n}\n',
      typescript: 'function merge(intervals: number[][]): number[][] {\n  return [];\n}\n',
      python:
        'def merge(intervals):\n    # Return the merged intervals, sorted by start\n    pass\n',
      cpp: '#include <vector>\n#include <algorithm>\nusing namespace std;\n\nvector<vector<int>> merge(vector<vector<int>>& intervals) {\n    // Return the merged intervals, sorted by start\n    return {};\n}\n',
    },
    title: 'Merge Intervals',
    difficulty: 'Medium',
    topics: ['sorting', 'arrays'],
    statement: `Given a list of intervals \`[start, end]\`, merge all overlapping intervals and return the result sorted by start.

**Example:** \`[[1,3],[2,6],[8,10],[15,18]]\` → \`[[1,6],[8,10],[15,18]]\`

Discuss the complexity, and what changes if the intervals arrive as a stream.`,
    followUps: [
      'What is the time complexity of sorting-based approach?',
      'How would you handle streaming intervals?',
      'Can you do this in-place?',
    ],
  },
  {
    slug: 'lru-cache',
    category: 'dsa',
    kind: 'class',
    entry: { javascript: 'LRUCache', python: 'LRUCache', cpp: 'LRUCache' },
    starter: {
      javascript:
        'class LRUCache {\n  constructor(capacity) {}\n\n  get(key) {\n    return -1;\n  }\n\n  put(key, value) {}\n}\n',
      typescript:
        'class LRUCache {\n  constructor(capacity: number) {}\n\n  get(key: number): number {\n    return -1;\n  }\n\n  put(key: number, value: number): void {}\n}\n',
      python:
        'class LRUCache:\n    def __init__(self, capacity):\n        pass\n\n    def get(self, key):\n        return -1\n\n    def put(self, key, value):\n        pass\n',
      cpp: '#include <unordered_map>\n#include <list>\nusing namespace std;\n\nclass LRUCache {\npublic:\n    LRUCache(int capacity) {}\n\n    int get(int key) {\n        return -1;\n    }\n\n    void put(int key, int value) {}\n};\n',
    },
    title: 'LRU Cache',
    difficulty: 'Medium',
    topics: ['design', 'hash map', 'linked list'],
    statement: `Design a cache with a fixed capacity that evicts the **least recently used** key when full.

Implement \`get(key)\` (returns the value or -1) and \`put(key, value)\`. Both must run in **O(1)** average time.

**Follow-up:** how would you make it safe for concurrent access?`,
    followUps: [
      'What is the time complexity of get and put?',
      'How would you make this thread-safe?',
      'What if you need to support TTL (expiration) on keys?',
    ],
  },
  {
    slug: 'rate-limiter',
    category: 'dsa',
    kind: 'class',
    entry: { javascript: 'RateLimiter', python: 'RateLimiter', cpp: 'RateLimiter' },
    starter: {
      javascript:
        'class RateLimiter {\n  constructor(limit, windowSeconds) {}\n\n  allow(userId, now) {\n    // now is in seconds; return true or false\n  }\n}\n',
      typescript:
        'class RateLimiter {\n  constructor(limit: number, windowSeconds: number) {}\n\n  allow(userId: string, now: number): boolean {\n    return false;\n  }\n}\n',
      python:
        'class RateLimiter:\n    def __init__(self, limit, window_seconds):\n        pass\n\n    def allow(self, user_id, now):\n        # now is in seconds; return True or False\n        pass\n',
      cpp: '#include <string>\n#include <unordered_map>\n#include <vector>\nusing namespace std;\n\nclass RateLimiter {\npublic:\n    RateLimiter(int limit, int windowSeconds) {}\n\n    bool allow(string userId, int now) {\n        return false;\n    }\n};\n',
    },
    title: 'Rate Limiter',
    difficulty: 'Medium',
    topics: ['design', 'queues', 'time'],
    statement: `Implement a \`RateLimiter(limit, windowSeconds)\` class with \`allow(userId, now)\`, which permits at most **limit requests per user in any sliding window of windowSeconds**. A request at time \`now\` (seconds) is allowed if fewer than \`limit\` requests by that user were *allowed* in \`(now - windowSeconds, now]\`; rejected requests don't count.

Start with a single process, then discuss how you would enforce it across many API servers (for example with Redis), and the trade-offs between a fixed window, a sliding log and a token bucket.`,
    followUps: [
      'Compare fixed window, sliding window log, and token bucket approaches.',
      'How would you implement this with Redis in a distributed system?',
      'What happens during a burst at a window boundary?',
    ],
  },
  {
    slug: 'top-k-frequent',
    category: 'dsa',
    kind: 'function',
    entry: { javascript: 'topKFrequent', python: 'top_k_frequent', cpp: 'topKFrequent' },
    starter: {
      javascript:
        'function topKFrequent(words, k) {\n  // Most frequent first; ties alphabetical\n}\n',
      typescript:
        'function topKFrequent(words: string[], k: number): string[] {\n  return [];\n}\n',
      python:
        'def top_k_frequent(words, k):\n    # Most frequent first; ties alphabetical\n    pass\n',
      cpp: '#include <vector>\n#include <string>\n#include <unordered_map>\n#include <queue>\nusing namespace std;\n\nvector<string> topKFrequent(vector<string>& words, int k) {\n    // Most frequent first; ties alphabetical\n    return {};\n}\n',
    },
    title: 'Top K Frequent Words',
    difficulty: 'Hard',
    topics: ['heap', 'hash map', 'streaming'],
    statement: `Given a list of words and an integer \`k\`, return the \`k\` most frequent words, ordered by frequency (ties broken alphabetically).

**Follow-ups:** do it in O(n log k); then assume the words arrive as an unbounded stream that does not fit in memory.`,
    followUps: [
      'What is the time complexity using a heap vs sorting?',
      'How would you handle streaming input?',
      'Can you do this in O(n) using bucket sort?',
    ],
  },
  // ---------------------------------------------------------------- Additional DSA problems (7-30)
  {
    slug: 'reverse-linked-list',
    category: 'dsa',
    kind: 'function',
    entry: { javascript: 'reverseList', python: 'reverse_list', cpp: 'reverseList' },
    starter: {
      javascript: 'function reverseList(head) {\n  // Return the new head\n}\n',
      typescript: 'function reverseList(head: ListNode | null): ListNode | null {\n  return null;\n}\n',
      python: 'def reverse_list(head):\n    pass\n',
      cpp: 'struct ListNode { int val; ListNode *next; ListNode(int x) : val(x), next(nullptr) {} };\n\nListNode* reverseList(ListNode* head) {\n    return nullptr;\n}\n',
    },
    title: 'Reverse Linked List',
    difficulty: 'Easy',
    topics: ['linked list', 'recursion'],
    statement: `Given the \`head\` of a singly linked list, reverse the list and return the reversed list.\n\n**Example:** \`1 → 2 → 3 → 4 → 5\` → \`5 → 4 → 3 → 2 → 1\`\n\n**Follow-up:** Can you do it both iteratively and recursively?`,
    followUps: ['Compare iterative vs recursive approach.', 'What about reversing a doubly linked list?', 'How would you reverse k nodes at a time?'],
  },
  {
    slug: 'max-subarray',
    category: 'dsa',
    kind: 'function',
    entry: { javascript: 'maxSubArray', python: 'max_sub_array', cpp: 'maxSubArray' },
    starter: {
      javascript: 'function maxSubArray(nums) {\n  // Return the max subarray sum\n}\n',
      typescript: 'function maxSubArray(nums: number[]): number {\n  return 0;\n}\n',
      python: 'def max_sub_array(nums):\n    pass\n',
      cpp: '#include <vector>\nusing namespace std;\n\nint maxSubArray(vector<int>& nums) {\n    return 0;\n}\n',
    },
    title: 'Maximum Subarray',
    difficulty: 'Medium',
    topics: ['arrays', 'dynamic programming', 'divide and conquer'],
    statement: `Given an integer array \`nums\`, find the subarray with the largest sum and return its sum.\n\n**Example:** \`[-2,1,-3,4,-1,2,1,-5,4]\` → \`6\` (subarray \`[4,-1,2,1]\`)`,
    followUps: ['Explain Kadane\'s algorithm.', 'Can you do this with divide and conquer?', 'What if you need to return the subarray itself?'],
  },
  {
    slug: 'binary-search',
    category: 'dsa',
    kind: 'function',
    entry: { javascript: 'search', python: 'search', cpp: 'search' },
    starter: {
      javascript: 'function search(nums, target) {\n  // Return index or -1\n}\n',
      typescript: 'function search(nums: number[], target: number): number {\n  return -1;\n}\n',
      python: 'def search(nums, target):\n    return -1\n',
      cpp: '#include <vector>\nusing namespace std;\n\nint search(vector<int>& nums, int target) {\n    return -1;\n}\n',
    },
    title: 'Binary Search',
    difficulty: 'Easy',
    topics: ['binary search', 'arrays'],
    statement: `Given a sorted array of integers \`nums\` and a \`target\`, return the index if found, else \`-1\`.\n\n**Example:** \`nums = [-1,0,3,5,9,12]\`, \`target = 9\` → \`4\``,
    followUps: ['What are common off-by-one errors in binary search?', 'How would you find the first/last occurrence?', 'What about searching in a rotated sorted array?'],
  },
  {
    slug: 'best-time-to-buy-sell-stock',
    category: 'dsa',
    kind: 'function',
    entry: { javascript: 'maxProfit', python: 'max_profit', cpp: 'maxProfit' },
    starter: {
      javascript: 'function maxProfit(prices) {\n  // Return the max profit\n}\n',
      typescript: 'function maxProfit(prices: number[]): number {\n  return 0;\n}\n',
      python: 'def max_profit(prices):\n    return 0\n',
      cpp: '#include <vector>\nusing namespace std;\n\nint maxProfit(vector<int>& prices) {\n    return 0;\n}\n',
    },
    title: 'Best Time to Buy and Sell Stock',
    difficulty: 'Easy',
    topics: ['arrays', 'greedy'],
    statement: `Given an array \`prices\` where \`prices[i]\` is the price on day \`i\`, find the maximum profit from one buy and one sell.\n\n**Example:** \`[7,1,5,3,6,4]\` → \`5\` (buy at 1, sell at 6)`,
    followUps: ['What if you can buy and sell multiple times?', 'What if there is a cooldown period?', 'What if there is a transaction fee?'],
  },
  {
    slug: 'climbing-stairs',
    category: 'dsa',
    kind: 'function',
    entry: { javascript: 'climbStairs', python: 'climb_stairs', cpp: 'climbStairs' },
    starter: {
      javascript: 'function climbStairs(n) {\n  // Return the number of ways\n}\n',
      typescript: 'function climbStairs(n: number): number {\n  return 0;\n}\n',
      python: 'def climb_stairs(n):\n    return 0\n',
      cpp: 'int climbStairs(int n) {\n    return 0;\n}\n',
    },
    title: 'Climbing Stairs',
    difficulty: 'Easy',
    topics: ['dynamic programming', 'math'],
    statement: `You are climbing a staircase with \`n\` steps. Each time you can climb 1 or 2 steps. How many distinct ways can you climb to the top?\n\n**Example:** \`n = 3\` → \`3\` (1+1+1, 1+2, 2+1)`,
    followUps: ['What is the relation to Fibonacci numbers?', 'Can you do this in O(1) space?', 'What if you can climb 1, 2, or 3 steps?'],
  },
  {
    slug: 'product-of-array-except-self',
    category: 'dsa',
    kind: 'function',
    entry: { javascript: 'productExceptSelf', python: 'product_except_self', cpp: 'productExceptSelf' },
    starter: {
      javascript: 'function productExceptSelf(nums) {\n  // Return the answer array\n}\n',
      typescript: 'function productExceptSelf(nums: number[]): number[] {\n  return [];\n}\n',
      python: 'def product_except_self(nums):\n    pass\n',
      cpp: '#include <vector>\nusing namespace std;\n\nvector<int> productExceptSelf(vector<int>& nums) {\n    return {};\n}\n',
    },
    title: 'Product of Array Except Self',
    difficulty: 'Medium',
    topics: ['arrays', 'prefix sum'],
    statement: `Given an integer array \`nums\`, return an array where each element is the product of all elements except itself. Do NOT use division.\n\n**Example:** \`[1,2,3,4]\` → \`[24,12,8,6]\``,
    followUps: ['Can you solve it in O(1) extra space (excluding output)?', 'How do you handle zeros in the array?', 'What about using prefix and suffix products?'],
  },
  {
    slug: 'longest-substring-without-repeating',
    category: 'dsa',
    kind: 'function',
    entry: { javascript: 'lengthOfLongestSubstring', python: 'length_of_longest_substring', cpp: 'lengthOfLongestSubstring' },
    starter: {
      javascript: 'function lengthOfLongestSubstring(s) {\n  // Return the length\n}\n',
      typescript: 'function lengthOfLongestSubstring(s: string): number {\n  return 0;\n}\n',
      python: 'def length_of_longest_substring(s):\n    return 0\n',
      cpp: '#include <string>\n#include <unordered_set>\nusing namespace std;\n\nint lengthOfLongestSubstring(string s) {\n    return 0;\n}\n',
    },
    title: 'Longest Substring Without Repeating Characters',
    difficulty: 'Medium',
    topics: ['sliding window', 'hash map', 'strings'],
    statement: `Given a string \`s\`, find the length of the longest substring without repeating characters.\n\n**Example:** \`"abcabcbb"\` → \`3\` (substring \`"abc"\`)`,
    followUps: ['Explain the sliding window technique.', 'What is the time and space complexity?', 'How would you return the substring itself?'],
  },
  {
    slug: 'three-sum',
    category: 'dsa',
    kind: 'function',
    entry: { javascript: 'threeSum', python: 'three_sum', cpp: 'threeSum' },
    starter: {
      javascript: 'function threeSum(nums) {\n  // Return all unique triplets\n}\n',
      typescript: 'function threeSum(nums: number[]): number[][] {\n  return [];\n}\n',
      python: 'def three_sum(nums):\n    return []\n',
      cpp: '#include <vector>\n#include <algorithm>\nusing namespace std;\n\nvector<vector<int>> threeSum(vector<int>& nums) {\n    return {};\n}\n',
    },
    title: '3Sum',
    difficulty: 'Medium',
    topics: ['arrays', 'two pointers', 'sorting'],
    statement: `Given an integer array \`nums\`, return all unique triplets \`[nums[i], nums[j], nums[k]]\` such that \`i != j != k\` and \`nums[i] + nums[j] + nums[k] == 0\`.\n\n**Example:** \`[-1,0,1,2,-1,-4]\` → \`[[-1,-1,2],[-1,0,1]]\``,
    followUps: ['How do you avoid duplicate triplets?', 'What is the time complexity?', 'Can you extend to 4Sum?'],
  },
  {
    slug: 'coin-change',
    category: 'dsa',
    kind: 'function',
    entry: { javascript: 'coinChange', python: 'coin_change', cpp: 'coinChange' },
    starter: {
      javascript: 'function coinChange(coins, amount) {\n  // Return min coins or -1\n}\n',
      typescript: 'function coinChange(coins: number[], amount: number): number {\n  return -1;\n}\n',
      python: 'def coin_change(coins, amount):\n    return -1\n',
      cpp: '#include <vector>\nusing namespace std;\n\nint coinChange(vector<int>& coins, int amount) {\n    return -1;\n}\n',
    },
    title: 'Coin Change',
    difficulty: 'Medium',
    topics: ['dynamic programming', 'BFS'],
    statement: `Given an array of coin denominations and a total \`amount\`, return the fewest number of coins needed to make up that amount. Return \`-1\` if impossible.\n\n**Example:** \`coins = [1,5,11]\`, \`amount = 15\` → \`3\` (5+5+5)`,
    followUps: ['Explain the DP recurrence.', 'Can you solve this with BFS?', 'What if you also need to return the coins used?'],
  },
  {
    slug: 'number-of-islands',
    category: 'dsa',
    kind: 'function',
    entry: { javascript: 'numIslands', python: 'num_islands', cpp: 'numIslands' },
    starter: {
      javascript: 'function numIslands(grid) {\n  // Return the count\n}\n',
      typescript: 'function numIslands(grid: string[][]): number {\n  return 0;\n}\n',
      python: 'def num_islands(grid):\n    return 0\n',
      cpp: '#include <vector>\nusing namespace std;\n\nint numIslands(vector<vector<char>>& grid) {\n    return 0;\n}\n',
    },
    title: 'Number of Islands',
    difficulty: 'Medium',
    topics: ['BFS', 'DFS', 'graph', 'matrix'],
    statement: `Given a 2D grid of \`'1'\`s (land) and \`'0'\`s (water), count the number of islands (connected components of land).\n\n**Example:** \`[["1","1","0"],["1","1","0"],["0","0","1"]]\` → \`2\``,
    followUps: ['BFS vs DFS — which do you prefer and why?', 'What about Union-Find?', 'How would you handle streaming grid updates?'],
  },
  {
    slug: 'validate-bst',
    category: 'dsa',
    kind: 'function',
    entry: { javascript: 'isValidBST', python: 'is_valid_bst', cpp: 'isValidBST' },
    starter: {
      javascript: 'function isValidBST(root) {\n  // Return true or false\n}\n',
      typescript: 'function isValidBST(root: TreeNode | null): boolean {\n  return false;\n}\n',
      python: 'def is_valid_bst(root):\n    return False\n',
      cpp: 'struct TreeNode { int val; TreeNode *left; TreeNode *right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} };\n\nbool isValidBST(TreeNode* root) {\n    return false;\n}\n',
    },
    title: 'Validate Binary Search Tree',
    difficulty: 'Medium',
    topics: ['binary tree', 'DFS', 'recursion'],
    statement: `Given the \`root\` of a binary tree, determine if it is a valid BST.\n\nA valid BST has: left subtree values < node value < right subtree values.\n\n**Example:** \`[2,1,3]\` → \`true\`, \`[5,1,4,null,null,3,6]\` → \`false\``,
    followUps: ['What is the in-order traversal approach?', 'How do you handle integer overflow for bounds?', 'Can you do it iteratively?'],
  },
  {
    slug: 'level-order-traversal',
    category: 'dsa',
    kind: 'function',
    entry: { javascript: 'levelOrder', python: 'level_order', cpp: 'levelOrder' },
    starter: {
      javascript: 'function levelOrder(root) {\n  // Return array of levels\n}\n',
      typescript: 'function levelOrder(root: TreeNode | null): number[][] {\n  return [];\n}\n',
      python: 'def level_order(root):\n    return []\n',
      cpp: '#include <vector>\n#include <queue>\nusing namespace std;\n\nstruct TreeNode { int val; TreeNode *left; TreeNode *right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} };\n\nvector<vector<int>> levelOrder(TreeNode* root) {\n    return {};\n}\n',
    },
    title: 'Binary Tree Level Order Traversal',
    difficulty: 'Medium',
    topics: ['binary tree', 'BFS', 'queue'],
    statement: `Given the \`root\` of a binary tree, return its level order traversal (each level as a separate array).\n\n**Example:** \`[3,9,20,null,null,15,7]\` → \`[[3],[9,20],[15,7]]\``,
    followUps: ['Can you do zigzag level order?', 'What about right side view of the tree?', 'How would you do this recursively?'],
  },
  {
    slug: 'course-schedule',
    category: 'dsa',
    kind: 'function',
    entry: { javascript: 'canFinish', python: 'can_finish', cpp: 'canFinish' },
    starter: {
      javascript: 'function canFinish(numCourses, prerequisites) {\n  // Return true or false\n}\n',
      typescript: 'function canFinish(numCourses: number, prerequisites: number[][]): boolean {\n  return false;\n}\n',
      python: 'def can_finish(num_courses, prerequisites):\n    return False\n',
      cpp: '#include <vector>\nusing namespace std;\n\nbool canFinish(int numCourses, vector<vector<int>>& prerequisites) {\n    return false;\n}\n',
    },
    title: 'Course Schedule',
    difficulty: 'Medium',
    topics: ['graph', 'topological sort', 'BFS', 'DFS'],
    statement: `There are \`numCourses\` courses labeled \`0\` to \`numCourses - 1\`. Some have prerequisites. Given \`prerequisites[i] = [a, b]\` meaning you must take \`b\` before \`a\`, determine if you can finish all courses.\n\n**Example:** \`numCourses = 2\`, \`[[1,0]]\` → \`true\`; \`[[1,0],[0,1]]\` → \`false\``,
    followUps: ['Explain topological sort.', 'DFS vs BFS (Kahn\'s algorithm)?', 'How would you return the course order?'],
  },
  {
    slug: 'word-break',
    category: 'dsa',
    kind: 'function',
    entry: { javascript: 'wordBreak', python: 'word_break', cpp: 'wordBreak' },
    starter: {
      javascript: 'function wordBreak(s, wordDict) {\n  // Return true or false\n}\n',
      typescript: 'function wordBreak(s: string, wordDict: string[]): boolean {\n  return false;\n}\n',
      python: 'def word_break(s, word_dict):\n    return False\n',
      cpp: '#include <string>\n#include <vector>\n#include <unordered_set>\nusing namespace std;\n\nbool wordBreak(string s, vector<string>& wordDict) {\n    return false;\n}\n',
    },
    title: 'Word Break',
    difficulty: 'Medium',
    topics: ['dynamic programming', 'trie', 'strings'],
    statement: `Given a string \`s\` and a dictionary of words \`wordDict\`, return \`true\` if \`s\` can be segmented into a space-separated sequence of dictionary words.\n\n**Example:** \`s = "leetcode"\`, \`wordDict = ["leet","code"]\` → \`true\``,
    followUps: ['What is the DP recurrence?', 'How would you return all possible segmentations?', 'What about using a Trie for the dictionary?'],
  },
  {
    slug: 'median-of-two-sorted-arrays',
    category: 'dsa',
    kind: 'function',
    entry: { javascript: 'findMedianSortedArrays', python: 'find_median_sorted_arrays', cpp: 'findMedianSortedArrays' },
    starter: {
      javascript: 'function findMedianSortedArrays(nums1, nums2) {\n  // Return the median\n}\n',
      typescript: 'function findMedianSortedArrays(nums1: number[], nums2: number[]): number {\n  return 0;\n}\n',
      python: 'def find_median_sorted_arrays(nums1, nums2):\n    return 0.0\n',
      cpp: '#include <vector>\nusing namespace std;\n\ndouble findMedianSortedArrays(vector<int>& nums1, vector<int>& nums2) {\n    return 0.0;\n}\n',
    },
    title: 'Median of Two Sorted Arrays',
    difficulty: 'Hard',
    topics: ['binary search', 'divide and conquer'],
    statement: `Given two sorted arrays \`nums1\` and \`nums2\`, return the median of the two sorted arrays. The overall run time complexity should be O(log(m+n)).\n\n**Example:** \`nums1 = [1,3]\`, \`nums2 = [2]\` → \`2.0\``,
    followUps: ['Why is binary search on the shorter array optimal?', 'What are the edge cases?', 'Can you generalize to find the kth element?'],
  },
  {
    slug: 'trapping-rain-water',
    category: 'dsa',
    kind: 'function',
    entry: { javascript: 'trap', python: 'trap', cpp: 'trap' },
    starter: {
      javascript: 'function trap(height) {\n  // Return units of water trapped\n}\n',
      typescript: 'function trap(height: number[]): number {\n  return 0;\n}\n',
      python: 'def trap(height):\n    return 0\n',
      cpp: '#include <vector>\nusing namespace std;\n\nint trap(vector<int>& height) {\n    return 0;\n}\n',
    },
    title: 'Trapping Rain Water',
    difficulty: 'Hard',
    topics: ['two pointers', 'stack', 'dynamic programming'],
    statement: `Given \`n\` non-negative integers representing an elevation map where the width of each bar is 1, compute how much water it can trap after raining.\n\n**Example:** \`[0,1,0,2,1,0,1,3,2,1,2,1]\` → \`6\``,
    followUps: ['Compare DP, two-pointer, and stack approaches.', 'Which uses the least space?', 'How would you extend to 2D (trapping rain water on a grid)?'],
  },
  {
    slug: 'longest-palindromic-substring',
    category: 'dsa',
    kind: 'function',
    entry: { javascript: 'longestPalindrome', python: 'longest_palindrome', cpp: 'longestPalindrome' },
    starter: {
      javascript: 'function longestPalindrome(s) {\n  // Return the longest palindromic substring\n}\n',
      typescript: 'function longestPalindrome(s: string): string {\n  return "";\n}\n',
      python: 'def longest_palindrome(s):\n    return ""\n',
      cpp: '#include <string>\nusing namespace std;\n\nstring longestPalindrome(string s) {\n    return "";\n}\n',
    },
    title: 'Longest Palindromic Substring',
    difficulty: 'Medium',
    topics: ['strings', 'dynamic programming', 'expand around center'],
    statement: `Given a string \`s\`, return the longest palindromic substring in \`s\`.\n\n**Example:** \`"babad"\` → \`"bab"\` (or \`"aba"\`)`,
    followUps: ['Explain the expand-around-center approach.', 'What is Manacher\'s algorithm?', 'DP approach and its space complexity?'],
  },
  {
    slug: 'container-with-most-water',
    category: 'dsa',
    kind: 'function',
    entry: { javascript: 'maxArea', python: 'max_area', cpp: 'maxArea' },
    starter: {
      javascript: 'function maxArea(height) {\n  // Return the max area\n}\n',
      typescript: 'function maxArea(height: number[]): number {\n  return 0;\n}\n',
      python: 'def max_area(height):\n    return 0\n',
      cpp: '#include <vector>\nusing namespace std;\n\nint maxArea(vector<int>& height) {\n    return 0;\n}\n',
    },
    title: 'Container With Most Water',
    difficulty: 'Medium',
    topics: ['two pointers', 'greedy'],
    statement: `Given \`n\` non-negative integers \`height[i]\` representing vertical lines, find two lines that together with the x-axis forms a container that holds the most water.\n\n**Example:** \`[1,8,6,2,5,4,8,3,7]\` → \`49\``,
    followUps: ['Why does the two-pointer technique work here?', 'Prove that moving the shorter pointer is always correct.', 'How is this different from trapping rain water?'],
  },
  {
    slug: 'group-anagrams',
    category: 'dsa',
    kind: 'function',
    entry: { javascript: 'groupAnagrams', python: 'group_anagrams', cpp: 'groupAnagrams' },
    starter: {
      javascript: 'function groupAnagrams(strs) {\n  // Return grouped anagrams\n}\n',
      typescript: 'function groupAnagrams(strs: string[]): string[][] {\n  return [];\n}\n',
      python: 'def group_anagrams(strs):\n    return []\n',
      cpp: '#include <vector>\n#include <string>\n#include <unordered_map>\n#include <algorithm>\nusing namespace std;\n\nvector<vector<string>> groupAnagrams(vector<string>& strs) {\n    return {};\n}\n',
    },
    title: 'Group Anagrams',
    difficulty: 'Medium',
    topics: ['hash map', 'strings', 'sorting'],
    statement: `Given an array of strings, group the anagrams together. You can return the answer in any order.\n\n**Example:** \`["eat","tea","tan","ate","nat","bat"]\` → \`[["bat"],["nat","tan"],["ate","eat","tea"]]\``,
    followUps: ['Sorting vs counting — which is faster?', 'What is the time complexity?', 'How would you check if two strings are anagrams in O(1)?'],
  },
  {
    slug: 'minimum-window-substring',
    category: 'dsa',
    kind: 'function',
    entry: { javascript: 'minWindow', python: 'min_window', cpp: 'minWindow' },
    starter: {
      javascript: 'function minWindow(s, t) {\n  // Return the minimum window substring\n}\n',
      typescript: 'function minWindow(s: string, t: string): string {\n  return "";\n}\n',
      python: 'def min_window(s, t):\n    return ""\n',
      cpp: '#include <string>\n#include <unordered_map>\nusing namespace std;\n\nstring minWindow(string s, string t) {\n    return "";\n}\n',
    },
    title: 'Minimum Window Substring',
    difficulty: 'Hard',
    topics: ['sliding window', 'hash map', 'strings'],
    statement: `Given strings \`s\` and \`t\`, return the minimum window substring of \`s\` such that every character in \`t\` (including duplicates) is included.\n\n**Example:** \`s = "ADOBECODEBANC"\`, \`t = "ABC"\` → \`"BANC"\``,
    followUps: ['Explain the two-pointer sliding window.', 'What is the time and space complexity?', 'How do you handle characters with multiplicity?'],
  },
  {
    slug: 'serialize-deserialize-binary-tree',
    category: 'dsa',
    kind: 'class',
    entry: { javascript: 'Codec', python: 'Codec', cpp: 'Codec' },
    starter: {
      javascript: 'class Codec {\n  serialize(root) {\n    return "";\n  }\n\n  deserialize(data) {\n    return null;\n  }\n}\n',
      typescript: 'class Codec {\n  serialize(root: TreeNode | null): string {\n    return "";\n  }\n\n  deserialize(data: string): TreeNode | null {\n    return null;\n  }\n}\n',
      python: 'class Codec:\n    def serialize(self, root):\n        return ""\n\n    def deserialize(self, data):\n        return None\n',
      cpp: '#include <string>\nusing namespace std;\n\nstruct TreeNode { int val; TreeNode *left; TreeNode *right; TreeNode(int x) : val(x), left(nullptr), right(nullptr) {} };\n\nclass Codec {\npublic:\n    string serialize(TreeNode* root) {\n        return "";\n    }\n\n    TreeNode* deserialize(string data) {\n        return nullptr;\n    }\n};\n',
    },
    title: 'Serialize and Deserialize Binary Tree',
    difficulty: 'Hard',
    topics: ['binary tree', 'design', 'BFS', 'DFS'],
    statement: `Design an algorithm to serialize a binary tree to a string and deserialize it back.\n\nThere is no restriction on how your serialization/deserialization algorithm should work. You just need to ensure that a binary tree can be serialized to a string and this string can be deserialized to the original tree structure.`,
    followUps: ['BFS vs DFS serialization — trade-offs?', 'How would you handle n-ary trees?', 'What about compressed serialization for large trees?'],
  },
  {
    slug: 'longest-increasing-subsequence',
    category: 'dsa',
    kind: 'function',
    entry: { javascript: 'lengthOfLIS', python: 'length_of_lis', cpp: 'lengthOfLIS' },
    starter: {
      javascript: 'function lengthOfLIS(nums) {\n  // Return length of LIS\n}\n',
      typescript: 'function lengthOfLIS(nums: number[]): number {\n  return 0;\n}\n',
      python: 'def length_of_lis(nums):\n    return 0\n',
      cpp: '#include <vector>\nusing namespace std;\n\nint lengthOfLIS(vector<int>& nums) {\n    return 0;\n}\n',
    },
    title: 'Longest Increasing Subsequence',
    difficulty: 'Medium',
    topics: ['dynamic programming', 'binary search'],
    statement: `Given an integer array \`nums\`, return the length of the longest strictly increasing subsequence.\n\n**Example:** \`[10,9,2,5,3,7,101,18]\` → \`4\` (subsequence \`[2,3,7,101]\`)`,
    followUps: ['Explain the O(n^2) DP approach.', 'How do you optimize to O(n log n) with binary search?', 'Can you reconstruct the actual subsequence?'],
  },
  {
    slug: 'implement-trie',
    category: 'dsa',
    kind: 'class',
    entry: { javascript: 'Trie', python: 'Trie', cpp: 'Trie' },
    starter: {
      javascript: 'class Trie {\n  constructor() {}\n\n  insert(word) {}\n\n  search(word) {\n    return false;\n  }\n\n  startsWith(prefix) {\n    return false;\n  }\n}\n',
      typescript: 'class Trie {\n  insert(word: string): void {}\n\n  search(word: string): boolean {\n    return false;\n  }\n\n  startsWith(prefix: string): boolean {\n    return false;\n  }\n}\n',
      python: 'class Trie:\n    def __init__(self):\n        pass\n\n    def insert(self, word):\n        pass\n\n    def search(self, word):\n        return False\n\n    def starts_with(self, prefix):\n        return False\n',
      cpp: '#include <string>\n#include <unordered_map>\nusing namespace std;\n\nclass Trie {\npublic:\n    Trie() {}\n\n    void insert(string word) {}\n\n    bool search(string word) {\n        return false;\n    }\n\n    bool startsWith(string prefix) {\n        return false;\n    }\n};\n',
    },
    title: 'Implement Trie (Prefix Tree)',
    difficulty: 'Medium',
    topics: ['trie', 'design', 'strings'],
    statement: `Implement a trie with \`insert\`, \`search\`, and \`startsWith\` methods.\n\n- \`insert(word)\`: Inserts the string \`word\`.\n- \`search(word)\`: Returns \`true\` if the word is in the trie.\n- \`startsWith(prefix)\`: Returns \`true\` if any word starts with that prefix.`,
    followUps: ['What is the space complexity?', 'How would you implement delete?', 'What about wildcard search (e.g., "a.c" matching "abc")?'],
  },
  {
    slug: 'kth-largest-element',
    category: 'dsa',
    kind: 'function',
    entry: { javascript: 'findKthLargest', python: 'find_kth_largest', cpp: 'findKthLargest' },
    starter: {
      javascript: 'function findKthLargest(nums, k) {\n  // Return the kth largest element\n}\n',
      typescript: 'function findKthLargest(nums: number[], k: number): number {\n  return 0;\n}\n',
      python: 'def find_kth_largest(nums, k):\n    return 0\n',
      cpp: '#include <vector>\nusing namespace std;\n\nint findKthLargest(vector<int>& nums, int k) {\n    return 0;\n}\n',
    },
    title: 'Kth Largest Element in an Array',
    difficulty: 'Medium',
    topics: ['heap', 'quickselect', 'sorting'],
    statement: `Given an integer array \`nums\` and an integer \`k\`, return the \`k\`th largest element. Note that it is the \`k\`th largest in sorted order, not the \`k\`th distinct element.\n\n**Example:** \`[3,2,1,5,6,4]\`, \`k = 2\` → \`5\``,
    followUps: ['Compare sorting, heap, and quickselect approaches.', 'What is the average vs worst case for quickselect?', 'How does this change with streaming data?'],
  },
];

export const SYSTEM_DESIGN_PROBLEMS: readonly SystemDesignProblem[] = [
  {
    slug: 'sd-url-shortener',
    title: 'Design a URL Shortener',
    difficulty: 'Medium',
    topics: ['hashing', 'database', 'caching', 'scalability'],
    category: 'system-design',
    statement: `Design a URL shortening service like bit.ly.\n\n**Requirements:**\n- Given a long URL, generate a short unique URL\n- Given a short URL, redirect to the original URL\n- Support custom short URLs\n- Track click analytics\n- Handle high read throughput (100:1 read/write ratio)\n\n**Scale:** 100M new URLs/month, 10B redirects/month`,
    expectations: [
      'Base62 encoding or hash-based ID generation',
      'Read-heavy: use caching (Redis/Memcached) for hot URLs',
      'Database sharding strategy (by hash prefix)',
      'Analytics pipeline (async writes, batch processing)',
      '301 vs 302 redirect trade-offs',
    ],
    followUps: [
      'How do you handle hash collisions?',
      'What happens if the cache goes down?',
      'How would you implement URL expiration?',
      'How do you prevent abuse (spam URLs)?',
    ],
    useWhiteboard: true,
  },
  {
    slug: 'sd-chat-system',
    title: 'Design a Real-Time Chat System',
    difficulty: 'Hard',
    topics: ['WebSocket', 'message queue', 'presence', 'storage'],
    category: 'system-design',
    statement: `Design a chat application like WhatsApp or Slack.\n\n**Requirements:**\n- 1:1 and group messaging\n- Online/offline status\n- Message delivery guarantees (sent, delivered, read)\n- Push notifications for offline users\n- Message history and search\n\n**Scale:** 500M DAU, 40B messages/day`,
    expectations: [
      'WebSocket connections with connection manager service',
      'Message queue for async delivery (Kafka/SQS)',
      'Presence service with heartbeats',
      'Fan-out on write vs fan-out on read for groups',
      'Message storage: recent in cache, historical in database',
    ],
    followUps: [
      'How do you handle the user connecting from multiple devices?',
      'What happens when a message fails to deliver?',
      'How do you implement end-to-end encryption?',
      'How do you handle group chat with 100K members?',
    ],
    useWhiteboard: true,
  },
  {
    slug: 'sd-news-feed',
    title: 'Design a Social Media News Feed',
    difficulty: 'Hard',
    topics: ['fan-out', 'ranking', 'caching', 'timeline'],
    category: 'system-design',
    statement: `Design the news feed system for a social network like Twitter or Facebook.\n\n**Requirements:**\n- Users can publish posts (text, images, videos)\n- Each user sees a personalized feed from people they follow\n- Feed is ranked (not purely chronological)\n- Near real-time updates\n\n**Scale:** 300M DAU, avg 200 follows/user, 1000 celebrity accounts with 10M+ followers`,
    expectations: [
      'Fan-out on write for normal users, fan-out on read for celebrities',
      'Feed generation service with ranking/ML model',
      'Pre-computed feed cache per user',
      'Media storage: CDN + object storage (S3)',
      'Push vs pull model trade-offs',
    ],
    followUps: [
      'How do you handle celebrity accounts with millions of followers?',
      'How does the ranking algorithm work?',
      'How do you handle real-time feed updates?',
      'What about content moderation?',
    ],
    useWhiteboard: true,
  },
  {
    slug: 'sd-rate-limiter',
    title: 'Design a Distributed Rate Limiter',
    difficulty: 'Medium',
    topics: ['rate limiting', 'distributed systems', 'Redis', 'algorithms'],
    category: 'system-design',
    statement: `Design a rate limiter that can be used across multiple API servers.\n\n**Requirements:**\n- Support multiple rate limiting rules (per user, per IP, per API)\n- Handle distributed deployment (multiple servers)\n- Low latency (< 1ms overhead)\n- Accurate counting (no significant over-counting)\n\n**Scale:** 10M requests/second across 1000 servers`,
    expectations: [
      'Token bucket vs sliding window vs fixed window algorithms',
      'Centralized counter (Redis) vs local + sync',
      'Race condition handling (Lua scripts in Redis)',
      'Rule configuration and storage',
      'Graceful degradation when Redis is down',
    ],
    followUps: [
      'Compare token bucket, leaky bucket, and sliding window.',
      'How do you handle the race condition between check and increment?',
      'What if Redis goes down — do you allow or deny?',
      'How do you rate limit by geographic region?',
    ],
    useWhiteboard: true,
  },
  {
    slug: 'sd-notification-system',
    title: 'Design a Notification System',
    difficulty: 'Medium',
    topics: ['message queue', 'pub/sub', 'push notifications', 'email'],
    category: 'system-design',
    statement: `Design a notification system that supports push, SMS, and email.\n\n**Requirements:**\n- Support multiple channels: push, SMS, email\n- User preferences (opt-in/out per channel and type)\n- Template-based notifications\n- Priority levels (urgent vs batch)\n- Delivery tracking and retry\n\n**Scale:** 10M notifications/day, 100M registered devices`,
    expectations: [
      'Producer-consumer pattern with message queue',
      'Separate worker pools per channel (push, SMS, email)',
      'Template engine with personalization',
      'Deduplication to prevent duplicate notifications',
      'Rate limiting per user to prevent notification fatigue',
    ],
    followUps: [
      'How do you prevent sending the same notification twice?',
      'How do you handle failures in third-party providers (Twilio, SES)?',
      'How would you implement digest notifications?',
      'How do you handle time zones for scheduled notifications?',
    ],
    useWhiteboard: true,
  },
  {
    slug: 'sd-search-autocomplete',
    title: 'Design Search Autocomplete',
    difficulty: 'Medium',
    topics: ['trie', 'caching', 'ranking', 'real-time'],
    category: 'system-design',
    statement: `Design a search autocomplete system like Google Search suggestions.\n\n**Requirements:**\n- Return top 5 suggestions as the user types\n- Suggestions ranked by popularity/frequency\n- Updated in near real-time as search patterns change\n- Support for multiple languages\n\n**Scale:** 10B queries/day, response time < 100ms`,
    expectations: [
      'Trie data structure for prefix matching',
      'Pre-computed top-k results at each trie node',
      'Caching layer (browser cache + CDN + application cache)',
      'Data collection pipeline for updating frequencies',
      'Sampling and aggregation for trending queries',
    ],
    followUps: [
      'How do you update the trie without downtime?',
      'How do you handle offensive or harmful suggestions?',
      'What about personalized suggestions?',
      'How do you handle queries in multiple languages/scripts?',
    ],
    useWhiteboard: true,
  },
  {
    slug: 'sd-video-streaming',
    title: 'Design a Video Streaming Platform',
    difficulty: 'Hard',
    topics: ['CDN', 'encoding', 'storage', 'adaptive bitrate'],
    category: 'system-design',
    statement: `Design a video streaming platform like YouTube or Netflix.\n\n**Requirements:**\n- Video upload and processing (transcoding to multiple resolutions)\n- Adaptive bitrate streaming\n- Global distribution with low latency\n- Recommendation engine\n\n**Scale:** 1B DAU, 500 hours of video uploaded per minute`,
    expectations: [
      'Upload → transcode pipeline (DAG of encoding tasks)',
      'Adaptive bitrate streaming (HLS/DASH)',
      'CDN for content delivery (edge caching)',
      'Object storage (S3) for video segments',
      'Metadata service for video info, comments, likes',
    ],
    followUps: [
      'How does adaptive bitrate streaming work (HLS/DASH)?',
      'How do you handle the transcoding pipeline at scale?',
      'What is the CDN cache invalidation strategy?',
      'How do you implement live streaming vs VOD?',
    ],
    useWhiteboard: true,
  },
  {
    slug: 'sd-distributed-cache',
    title: 'Design a Distributed Cache',
    difficulty: 'Hard',
    topics: ['caching', 'consistent hashing', 'replication', 'eviction'],
    category: 'system-design',
    statement: `Design a distributed cache system like Memcached or Redis Cluster.\n\n**Requirements:**\n- Key-value store with sub-millisecond latency\n- Horizontal scaling (add/remove nodes)\n- High availability (node failure tolerance)\n- Eviction policies (LRU, LFU, TTL)\n\n**Scale:** 10TB data, 1M requests/second, 99.99% availability`,
    expectations: [
      'Consistent hashing with virtual nodes for distribution',
      'Replication strategy (leader-follower or multi-primary)',
      'Cache eviction policies (LRU, LFU, TTL)',
      'Hot key problem and solutions',
      'Cache stampede prevention (locking, probabilistic early expiration)',
    ],
    followUps: [
      'What happens when a node goes down?',
      'How do you handle hot keys (celebrity problem)?',
      'Compare cache-aside, write-through, and write-behind patterns.',
      'How do you handle cache stampede/thundering herd?',
    ],
    useWhiteboard: true,
  },
  {
    slug: 'sd-payment-system',
    title: 'Design a Payment System',
    difficulty: 'Hard',
    topics: ['transactions', 'idempotency', 'ledger', 'reconciliation'],
    category: 'system-design',
    statement: `Design a payment processing system like Stripe or PayPal.\n\n**Requirements:**\n- Process credit card payments\n- Support refunds\n- Exactly-once payment guarantee\n- Audit trail and reconciliation\n- Multi-currency support\n\n**Scale:** 1M transactions/day, 99.99% reliability`,
    expectations: [
      'Idempotency keys to prevent double charges',
      'Double-entry bookkeeping ledger',
      'Payment state machine (pending → authorized → captured → settled)',
      'Async reconciliation with payment processor',
      'Encryption and PCI-DSS compliance',
    ],
    followUps: [
      'How do you ensure exactly-once payment?',
      'What happens if the payment gateway times out?',
      'How do you handle currency conversion?',
      'What is the reconciliation process?',
    ],
    useWhiteboard: true,
  },
  {
    slug: 'sd-task-scheduler',
    title: 'Design a Distributed Task Scheduler',
    difficulty: 'Medium',
    topics: ['scheduling', 'message queue', 'cron', 'fault tolerance'],
    category: 'system-design',
    statement: `Design a distributed task scheduler like Airflow or Celery.\n\n**Requirements:**\n- Schedule tasks (one-time and recurring/cron)\n- Priority-based execution\n- At-least-once execution guarantee\n- Task dependencies (DAG)\n- Monitoring and retry with backoff\n\n**Scale:** 10M tasks/day, tasks ranging from seconds to hours`,
    expectations: [
      'Task queue with priority (Redis sorted set or dedicated MQ)',
      'Worker pool with heartbeat-based health checks',
      'DAG execution engine for task dependencies',
      'Persistent storage for task state and history',
      'Dead letter queue for failed tasks',
    ],
    followUps: [
      'How do you prevent the same task from running on two workers?',
      'How do you handle long-running tasks?',
      'What is your retry strategy (exponential backoff)?',
      'How do you handle task dependencies (fan-in/fan-out)?',
    ],
    useWhiteboard: true,
  },
];

export const findProblem = (slug: string) => INTERVIEW_PROBLEMS.find((p) => p.slug === slug);
export const findSystemDesignProblem = (slug: string) => SYSTEM_DESIGN_PROBLEMS.find((p) => p.slug === slug);
export function randomProblem(): InterviewProblem {
  return INTERVIEW_PROBLEMS[Math.floor(Math.random() * INTERVIEW_PROBLEMS.length)]!;
}

// ---------------------------------------------------------------- proctoring

export const PROCTORING_EVENT_TYPES = [
  'TAB_SWITCH',
  'FULLSCREEN_EXIT',
  'COPY_PASTE',
  'FOCUS_LOST',
  'SCREEN_SHARE_STOPPED',
  'RIGHT_CLICK',
  'DEVTOOLS_OPEN',
  'MULTIPLE_TABS',
  'CAMERA_SNAPSHOT',
  'IDLE_DETECTED',
] as const;
export type ProctoringEventType = (typeof PROCTORING_EVENT_TYPES)[number];

export const proctoringEventSchema = z.object({
  type: z.enum(PROCTORING_EVENT_TYPES),
  detail: z.string().max(500).default(''),
});
export type ProctoringEventInput = z.infer<typeof proctoringEventSchema>;

export interface ProctoringEventDto {
  id: string;
  sessionId: string;
  userId: string;
  username: string;
  type: ProctoringEventType;
  detail: string;
  createdAt: string;
}

export interface ProctoringConfigDto {
  enabled: boolean;
  requireCamera: boolean;
  requireScreenShare: boolean;
  enforceFullscreen: boolean;
  blockCopyPaste: boolean;
}

export const proctoringConfigSchema = z.object({
  enabled: z.boolean().default(false),
  requireCamera: z.boolean().default(false),
  requireScreenShare: z.boolean().default(false),
  enforceFullscreen: z.boolean().default(true),
  blockCopyPaste: z.boolean().default(true),
});

export interface ProctoringStatusDto {
  events: ProctoringEventDto[];
  violations: number;
  config: ProctoringConfigDto;
}

export const interviewSetupSchema = z
  .object({
    /** A problem from the bank… */
    problemSlug: z.string().max(60).optional(),
    /** …or the interviewer's own. */
    customProblem: z
      .object({
        title: z.string().trim().min(3).max(120),
        statement: z.string().trim().min(10).max(8_000),
      })
      .optional(),
    durationMinutes: z.coerce.number().int().min(10).max(120).default(45),
    proctoring: proctoringConfigSchema.optional(),
  })
  .refine((v) => Boolean(v.problemSlug) !== Boolean(v.customProblem), {
    message: 'Pick a problem from the bank or write your own',
    path: ['problemSlug'],
  })
  .refine((v) => !v.problemSlug || v.problemSlug === 'random' || findProblem(v.problemSlug), {
    message: 'Unknown problem',
    path: ['problemSlug'],
  });
export type InterviewSetupInput = z.input<typeof interviewSetupSchema>;

export const interviewControlSchema = z.discriminatedUnion('action', [
  /** Reveal the problem to the candidate and start the clock. */
  z.object({ action: z.literal('start') }),
  z.object({ action: z.literal('extend'), minutes: z.coerce.number().int().min(1).max(30) }),
  z.object({ action: z.literal('end') }),
]);
export type InterviewControlInput = z.infer<typeof interviewControlSchema>;

/** What every participant sees. Notes and the scorecard are never part of it. */
export interface InterviewStateDto {
  sessionId: string;
  /** Null for the candidate until the interviewer starts the clock. */
  problem: {
    title: string;
    statement: string;
    difficulty: Difficulty | null;
    /** Bank problems only (null for a custom problem). */
    slug: string | null;
    /** Whether solutions can be checked against tests. */
    hasTests: boolean;
  } | null;
  problemHidden: boolean;
  durationMinutes: number;
  startedAt: string | null;
  endsAt: string | null;
  endedAt: string | null;
  /** Server clock when this was produced, so clients can correct for skew. */
  serverNow: string;
  /** Proctoring settings for the interview, if enabled. */
  proctoring: ProctoringConfigDto | null;
}

export const RATING_KEYS = ['problemSolving', 'codeQuality', 'communication', 'testing'] as const;
export type RatingKey = (typeof RATING_KEYS)[number];
export const RATING_LABELS: Record<RatingKey, string> = {
  problemSolving: 'Problem solving',
  codeQuality: 'Code quality',
  communication: 'Communication',
  testing: 'Testing and edge cases',
};

export const RECOMMENDATIONS = ['STRONG_NO', 'NO', 'YES', 'STRONG_YES'] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];

/** Private to the interviewer who wrote it. */
export const scorecardSchema = z.object({
  notes: z.string().max(20_000).default(''),
  ratings: z
    .object(
      Object.fromEntries(
        RATING_KEYS.map((k) => [k, z.number().int().min(1).max(4).optional()]),
      ) as Record<RatingKey, z.ZodOptional<z.ZodNumber>>,
    )
    .partial()
    .default({}),
  recommendation: z.enum(RECOMMENDATIONS).nullable().default(null),
});
export type ScorecardInput = z.input<typeof scorecardSchema>;

export interface ScorecardDto {
  notes: string;
  ratings: Partial<Record<RatingKey, number>>;
  recommendation: Recommendation | null;
  updatedAt: string | null;
}

/** Short-lived credential for the browser to talk to the Gemini Live API directly. */
export interface VoiceTokenDto {
  token: string;
  model: string;
  /** The session must be opened before this (about a minute). */
  connectBy: string;
  /** The conversation is cut off after this. */
  expiresAt: string;
}

export const transcriptEntrySchema = z.object({
  role: z.enum(['interviewer', 'candidate']),
  text: z.string().trim().min(1).max(4_000),
});
export type TranscriptEntry = z.infer<typeof transcriptEntrySchema>;

export const interviewFeedbackRequestSchema = z.object({
  transcript: z.array(transcriptEntrySchema).min(2).max(600),
  /** The candidate's code at the end (the client holds the live document). */
  code: z.string().max(64_000).default(''),
});
export type InterviewFeedbackRequest = z.input<typeof interviewFeedbackRequestSchema>;

/** What the model must return; validated before it is stored. */
export const aiInterviewFeedbackSchema = z.object({
  scores: z.object(
    Object.fromEntries(RATING_KEYS.map((k) => [k, z.number().int().min(1).max(4)])) as Record<
      RatingKey,
      z.ZodNumber
    >,
  ),
  strengths: z.array(z.string().max(400)).max(5),
  improvements: z.array(z.string().max(400)).max(5),
  summary: z.string().max(1_500),
  recommendation: z.enum(RECOMMENDATIONS),
});
export type AiInterviewFeedback = z.infer<typeof aiInterviewFeedbackSchema>;

export interface InterviewFeedbackDto extends AiInterviewFeedback {
  id: string;
  sessionId: string;
  model: string;
  isDemo: boolean;
  turns: number;
  createdAt: string;
}

export const submitSolutionSchema = z.object({
  language: z.enum(['javascript', 'typescript', 'python', 'cpp']),
  code: z.string().min(1).max(64_000),
});
export type SubmitSolutionInput = z.infer<typeof submitSolutionSchema>;

export interface TestCaseResultDto {
  index: number;
  hidden: boolean;
  passed: boolean;
  /** Visible tests only: what was called, what was expected and what came back. */
  input?: string;
  expected?: string;
  actual?: string;
  /** An exception thrown by the solution for this test (shown for hidden tests too). */
  error?: string;
}

export type SubmissionStatus = 'passed' | 'failed' | 'error' | 'timeout';

/** A solution checked against the problem's tests, shared live with the room. */
export interface SubmissionDto {
  id: string;
  sessionId: string;
  user: UserSummary;
  problemSlug: string;
  language: RunnableProblemLanguage;
  status: SubmissionStatus;
  passed: number;
  total: number;
  cases: TestCaseResultDto[];
  /** Whatever the solution printed, and any error output (truncated). */
  stdout: string;
  stderr: string;
  durationMs: number;
  createdAt: string;
}

export interface InterviewHistoryItemDto {
  sessionId: string;
  title: string;
  problemTitle: string | null;
  difficulty: Difficulty | null;
  /** practice = you hosted it alone (for example with the AI interviewer). */
  role: 'interviewer' | 'candidate' | 'practice';
  status: 'SCHEDULED' | 'LIVE' | 'ENDED';
  createdAt: string;
  startedAt: string | null;
  durationMinutes: number;
  /** Your best test run in this interview. */
  bestSubmission: { passed: number; total: number } | null;
  /** Your latest AI feedback here: the average of the four scores (1-4). */
  feedback: { average: number; recommendation: Recommendation; createdAt: string } | null;
  /** Hosts only: your own private recommendation from the scorecard. */
  myRecommendation: Recommendation | null;
}

export interface InterviewHistoryDto {
  items: InterviewHistoryItemDto[];
  stats: {
    interviews: number;
    asCandidate: number;
    asInterviewer: number;
    practice: number;
    /** Average AI feedback score (1-4) across interviews that have feedback. */
    averageScore: number | null;
    /** Share of test runs (best per interview) that passed every test. */
    solvedRate: number | null;
  };
}
