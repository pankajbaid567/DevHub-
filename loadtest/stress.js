// Stress test: ramps read traffic until latency or errors break, to find the capacity knee.
//   docker run --rm --network devhub_default -v "$PWD/loadtest:/scripts" grafana/k6:1.4.2 run /scripts/stress.js
import http from 'k6/http';
import { check } from 'k6';

const API = `${__ENV.BASE_URL || 'http://web'}/api/v1`;

export const options = {
  scenarios: {
    ramp: {
      executor: 'ramping-arrival-rate',
      startRate: 100,
      timeUnit: '1s',
      preAllocatedVUs: 200,
      maxVUs: 2000,
      stages: [
        { duration: '30s', target: 500 },
        { duration: '30s', target: 1000 },
        { duration: '30s', target: 1500 },
        { duration: '30s', target: 2000 },
        { duration: '30s', target: 2500 },
      ],
    },
  },
  thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<300'] },
};

export function setup() {
  return {
    ids: http
      .get(`${API}/questions?limit=20`)
      .json('items')
      .map((q) => q.id),
  };
}

export default function (data) {
  const r =
    Math.random() < 0.5
      ? http.get(`${API}/questions?sort=newest&limit=20`, { tags: { name: 'list' } })
      : http.get(`${API}/questions/${data.ids[Math.floor(Math.random() * data.ids.length)]}`, {
          tags: { name: 'detail' },
        });
  check(r, { ok: (res) => res.status === 200 });
}
