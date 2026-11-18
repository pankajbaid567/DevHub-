// k6 load test for the DevHub+ REST API.
//   docker compose -f docker-compose.yml -f loadtest/docker-compose.loadtest.yml up -d --build --scale api=2
//   docker run --rm --network devhub_default -v "$PWD/loadtest:/scripts" grafana/k6:1.4.2 run /scripts/api.js
//
// Three concurrent workloads against nginx (two API replicas behind it):
//   browse  - anonymous readers: question lists, details, tags, leaderboard, keyword search
//   search  - hybrid (full-text + pgvector) search with a realistic, repeating query mix
//   voters  - signed-in users voting on the same few questions: contended transactional writes
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'http://web:8080';
const API = `${BASE}/api/v1`;
const VOTERS = Number(__ENV.VOTERS || 40);

const voteLatency = new Trend('vote_latency', true);
const searchLatency = new Trend('hybrid_search_latency', true);

export const options = {
  scenarios: {
    browse: {
      executor: 'ramping-vus',
      exec: 'browse',
      stages: [
        { duration: '20s', target: 100 },
        { duration: '60s', target: 200 },
        { duration: '10s', target: 0 },
      ],
    },
    search: {
      executor: 'constant-arrival-rate',
      exec: 'search',
      rate: 30,
      timeUnit: '1s',
      duration: '90s',
      preAllocatedVUs: 30,
      maxVUs: 100,
    },
    voters: {
      executor: 'constant-vus',
      exec: 'vote',
      vus: VOTERS,
      duration: '90s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{scenario:browse}': ['p(95)<250'],
    hybrid_search_latency: ['p(95)<400'],
    vote_latency: ['p(95)<400'],
  },
};

const json = { headers: { 'Content-Type': 'application/json' } };

export function setup() {
  const questions = http
    .get(`${API}/questions?limit=20`)
    .json('items')
    .map((q) => q.id);
  // One account per voter (registration is bcrypt-bound, so it happens once, up front).
  const run = Date.now().toString(36);
  const tokens = [];
  for (let i = 0; i < VOTERS; i++) {
    const username = `lt_${run}_${i}`;
    const res = http.post(
      `${API}/auth/register`,
      JSON.stringify({ username, email: `${username}@load.test`, password: 'password123' }),
      json,
    );
    check(res, { registered: (r) => r.status === 201 });
    tokens.push(res.json('accessToken'));
  }
  return { questions, tokens };
}

const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];

export function browse(data) {
  const sort = pick(['newest', 'votes', 'active', 'unanswered']);
  const list = http.get(`${API}/questions?sort=${sort}&limit=20`, { tags: { name: 'list' } });
  check(list, { 'list 200': (r) => r.status === 200 });
  http.get(`${API}/questions/${pick(data.questions)}`, { tags: { name: 'detail' } });
  if (Math.random() < 0.3) http.get(`${API}/tags`, { tags: { name: 'tags' } });
  if (Math.random() < 0.2) http.get(`${API}/users/leaderboard`, { tags: { name: 'leaderboard' } });
  if (Math.random() < 0.3)
    http.get(
      `${API}/questions?q=${encodeURIComponent(pick(['postgres', 'react hook', 'redis', 'express error']))}`,
      {
        tags: { name: 'fts' },
      },
    );
  sleep(Math.random() * 1.5 + 0.5);
}

const QUERIES = [
  'prevent two users booking the same seat',
  'my sql query got slow',
  'handle errors in express',
  'when to use a cache',
  'real-time collaborative editing algorithm',
  'debounce input in react',
  'graceful shutdown node server',
  'retry with backoff',
];

export function search() {
  const res = http.get(`${API}/search?q=${encodeURIComponent(pick(QUERIES))}`, {
    tags: { name: 'hybrid' },
  });
  check(res, { 'search 200': (r) => r.status === 200 });
  searchLatency.add(res.timings.duration);
}

export function vote(data) {
  // __VU is global across scenarios, so some voters share an account: deliberate, it models
  // the same user voting from two tabs at once (a race the API must serialise).
  const token = data.tokens[(__VU - 1) % data.tokens.length];
  // Few targets, many voters: the same rows are updated concurrently (row locks, ledger).
  const q = data.questions[Math.floor(Math.random() * 3)];
  const res = http.post(
    `${API}/questions/${q}/vote`,
    JSON.stringify({ value: pick([1, 0]) }), // new accounts cannot downvote yet
    { headers: { ...json.headers, Authorization: `Bearer ${token}` }, tags: { name: 'vote' } },
  );
  check(res, { 'vote 200': (r) => r.status === 200 });
  voteLatency.add(res.timings.duration);
  sleep(0.2);
}
