# Performance and load testing

Measured with [k6](https://k6.io) against the production Docker stack: nginx in front of two API replicas (see the note below: one load-generator IP means one replica served the HTTP load), Postgres 16 (pgvector), Redis and the worker queue. Scripts are in [`loadtest/`](../loadtest).

**Environment:** a single MacBook (Apple M3) running Docker Desktop, with k6 running in a container on the *same* machine (so the load generator competes with the system under test for CPU). Treat the numbers as a conservative floor for one laptop, not a cloud benchmark.

```bash
docker compose -f docker-compose.yml -f loadtest/docker-compose.loadtest.yml up -d --build --scale api=2
docker run --rm --network devhub_default -v "$PWD/loadtest:/scripts" grafana/k6:1.4.2 run /scripts/api.js
docker run --rm --network devhub_default -v "$PWD/loadtest:/scripts" grafana/k6:1.4.2 run /scripts/stress.js
```

The overlay only adds a `RATE_LIMIT_ALLOWLIST` for the Docker network, so the single-IP load generator isn't throttled. Limits stay on for everyone else.

> **These are single-replica numbers.** nginx balances with `ip_hash` (Socket.IO's HTTP long-polling fallback needs a client to stay on one replica), and k6 sends everything from one IP, so the Grafana "requests per replica" panel shows all of the load on one replica. The figures below are therefore what **one** API process sustains. Real users spread across replicas by IP, and for a WebSocket-only client, `least_conn` balancing would remove the pinning entirely.

## Mixed workload (`api.js`, 90 s)

Three concurrent scenarios:

| Scenario | Load | What it exercises |
|---|---|---|
| `browse` | Ramps to **200 virtual users** | Question lists (4 sorts), question detail, tags, leaderboard, full-text search |
| `search` | **30 req/s** constant | Hybrid search: full-text + pgvector + RRF, with query embeddings cached |
| `voters` | **40 users** voting continuously on the **same 3 questions** | Contended transactional writes: vote row, score counter, reputation and ledger in one transaction |

| Metric | Result | Threshold |
|---|---|---|
| Requests | **44,549** (≈ 440 req/s) | |
| Failed requests | **0.00 %** | < 1 % |
| Browse latency p95 | **7.3 ms** | < 250 ms |
| Hybrid search p95 | **13.7 ms** | < 400 ms |
| Contended vote p95 | **29.5 ms** | < 400 ms |
| Reputation ledger after the run | **0 mismatches** across 184 users; every question score equals the sum of its votes | Invariant |

## Stress test (`stress.js`)

Reads (list and detail) at a ramping arrival rate until something breaks:

| Target rate | Achieved | p50 | p95 | p99 | Errors |
|---|---|---|---|---|---|
| 100 → 500 req/s | 293 req/s | 1.4 ms | 9.2 ms | 67 ms | 0 |
| 500 → 1,000 req/s | 743 req/s | 1.2 ms | 6.8 ms | 47 ms | 0 |
| 1,000 → 1,500 req/s | 1,234 req/s | 1.3 ms | 24.8 ms | 187 ms | 0 |
| 1,500 → 2,000 req/s | 1,735 req/s | 1.5 ms | 61.8 ms | 171 ms | 0 |
| 2,000 → 2,500 req/s | 2,222 req/s | 7.3 ms | 184 ms | 1,002 ms | 0 |

**The knee is about 2,000 req/s for a single API replica on one laptop**, with no errors at any stage. Past it, latency degrades gradually rather than failing. The next levers are more replicas (stateless, verified with `--scale api=3`), a read replica for list queries and caching hot question pages.

## Bugs the load test found (all fixed, with regression tests)

1. **Concurrent votes by the same user** (two tabs or a double click) raced. Both transactions read the same previous vote, so one could apply score and reputation deltas from a stale starting point, or delete a row the other had already deleted (6 × HTTP 500 in 17k votes). **Fix:** a transaction-scoped advisory lock per (user, post). **Test:** a burst of 60 mixed votes from one user. No failures are allowed, and score, reputation and ledger must match the surviving vote (it fails without the fix).
2. **502s on POSTs behind nginx** (5 in 17k). Node closes idle keep-alive sockets after 5 s, and nginx occasionally reused one at that moment. nginx silently retried the idempotent GETs, but it can't retry POSTs. **Fix:** API `keepAliveTimeout` 65 s, longer than nginx's upstream `keepalive_timeout` of 30 s. 0 errors after the fix.
3. **Connection-pool starvation on small machines** (surfaced by CI's 2-vCPU runners, where Prisma's default pool is 5). The outbox relay held a transaction open across Redis calls. **Fix:** an explicit `DB_POOL_SIZE` (10), a lease-based relay (one short claiming statement, no long transaction) and a batch transaction for notifications. The E2E suite now passes even with the pool forced down to 3 connections. While doing this, I also found that the poison-row backoff didn't actually back off, so it now uses its own `lockedUntil` lease, with a test that counts relay attempts.
