# System design

This covers how DevHub+ behaves under load and failure, what has been verified, and what I would change at larger scale.

## Requirements

| Functional | Non-functional |
|---|---|
| Q&A with votes, accepted answers, reputation, search | Reads p95 < 150 ms; writes p95 < 300 ms |
| Real-time collaborative editing, presence, chat | Edit propagation < 100 ms within a region; no lost edits |
| Notifications pushed live | At-least-once creation; push is best effort, with a REST fallback |
| AI mentor (streaming), resume and skill analysis | Bounded cost: per-user hourly limit and timeouts |
| | Horizontal scalability, graceful degradation without Redis or AI |

## Back-of-envelope sizing

Assume 100k registered users, 10k daily active, and 1k concurrent at peak.

- **Reads.** About 50 page views per DAU per day is 500k requests a day, roughly 6 rps on average and around 60 rps at peak. One API instance handles this comfortably. Postgres is the first real bottleneck, not Node.
- **WebSockets.** Assume 1k concurrent sockets, with 5% in live sessions (50 rooms of about 4 people). A burst of 5 Yjs updates per second per active editor is about 1k messages per second fanned out, which is trivial for Socket.IO. Memory is about 50 KB per socket, so roughly 50 MB.
- **Storage.**
  - Questions plus answers are about 2 KB each; 1M posts is about 2 GB, plus indexes.
  - CRDT state is typically 1–3 times the text size, and is capped at 200k characters per session.
  - Chat is about 200 B per message.
- **AI.** The cost driver is capped at 30 requests per user per hour by default, with a 45 s timeout and abort-on-disconnect.

## Horizontal scaling

```
             ┌─────────── nginx (ip_hash, WS upgrade, SSE unbuffered) ───────────┐
             ▼                          ▼                          ▼
        API replica 1             API replica 2             API replica N     (stateless)
             │  ▲                       │  ▲                       │  ▲
             ▼  │  Socket.IO Redis adapter: rooms, broadcasts, fetchSockets, serverSideEmit
          ┌──────────── Redis: pub/sub · cache · rate-limit counters · view de-dup ────────┐
          └────────────────────────────── PostgreSQL ─────────────────────────────────────┘
```

- **The API is stateless.** Sessions are JWTs, rate limits and caches live in Redis, and uploads are processed in memory without touching disk.
- **Socket.IO** uses the Redis adapter, so a broadcast to `session:<id>` reaches clients on every replica. Presence uses `fetchSockets()`, which is cluster-wide.
- **Sticky sessions.** These are needed only for Socket.IO's HTTP long-polling fallback, and nginx provides them with `ip_hash`. WebSocket-only clients would not need them.
- **Collaborative documents** live as one in-memory Yjs doc per active session per replica:
  - Client updates are applied locally, broadcast to the room, and relayed to other replicas with `serverSideEmit`.
  - CRDT merges are commutative and idempotent, so copies converge regardless of order or duplicates.
  - Persistence merges rather than overwrites: under `SELECT … FOR UPDATE`, the stored state and the replica's state are merged, and the result is fed back to the replica. A lost relay therefore cannot lose edits.

**Verified.** With `docker compose up --scale api=2`, a test client inside the Docker network connects user A to replica 1 and user B to replica 2:

- each sees the other's presence;
- CRDT edits and chat cross the replicas;
- the persisted document contains both users' edits.

This test found two real bugs, both now fixed and covered by regression tests:

1. A relay payload was corrupted by msgpack encoding.
2. Replicas overwrote each other's saves.

**At larger scale** I would route each session to an owner replica (consistent hashing on session id), or use `y-redis` and its streams. That removes duplicated documents and makes persistence single-writer.

## Video calls

Calls are WebRTC **mesh**: each participant uploads one stream per peer.

- At 6 people and about 500 kbps per stream, that's about 2.5 Mbps up per person, which is fine for small pairing rooms. That's why the server caps calls at 6.
- The server's only cost is signalling (a few dozen small messages per pair), relayed across replicas through the Redis adapter.
- Membership is checked once per peer pair and cached on the socket, so ICE candidates don't each trigger a cluster lookup.
- STUN handles most networks. Strict corporate NATs need TURN (for example coturn), which can be enabled through the environment.
- **Next step:** an SFU (LiveKit or mediasoup) for large rooms, recording and simulcast, keeping the same `rtc:*` signalling contract.

## Caching

| Data | Strategy | TTL | Invalidation |
|---|---|---|---|
| Leaderboard | Read-through (`cached()`) | 60 s | Time-based. Staleness is acceptable. |
| Popular tags | Read-through | 5 min | Explicit delete when a question is created |
| Question view de-duplication | `SET NX EX` per viewer | 1 h | Expiry |
| Rate-limit windows | Redis counters | Per window | Expiry |

Caches are behind the `Cache` interface: Redis in production, an in-memory bounded FIFO when Redis is absent.

## Consistency and concurrency

| Hazard | Mitigation | Test |
|---|---|---|
| Two concurrent first votes by one user | Unique `(userId, targetId)` plus whole-transaction retry | `survives concurrent duplicate votes` |
| Last seat in a session taken twice | `SELECT … FOR UPDATE` on the session row | `enforces capacity under concurrent joins` |
| Two refreshes with the same token | Conditional `UPDATE … WHERE revokedAt IS NULL` (atomic claim) | `allows only one of two concurrent refreshes` |
| Counter drift | Counters only change inside the source row's transaction, plus `CHECK >= 0` | Ledger invariant assertions |
| Lost edits across replicas | CRDT merge under a row lock | `merges concurrent saves under a row lock` |
| Demo seed raced by several replicas | Postgres advisory lock | Verified with two replicas in Compose |

## Failure modes

| Failure | Behaviour |
|---|---|
| **Redis down** | Readiness check fails (`/ready` returns 503, so the load balancer stops routing). Existing instances keep serving REST, and ioredis retries in the background. In development, the API simply runs without Redis. |
| **Gemini quota, overload or hang** | The primary model gets 60% of the time budget; then the fallback model runs with the remainder. After 2 consecutive failures a circuit breaker routes straight to the fallback for 60 s. If both fail, a `503 AI_UNAVAILABLE` with a friendly message (mentor streams send an `error` event). This was observed live: the primary returned 503 "high demand" errors, and every feature kept working on the fallback. |
| **No AI key** | `DemoProvider` gives deterministic, clearly labelled responses. |
| **Client disconnects mid-edit** | Yjs state is held locally. On reconnect the client re-joins and re-sends its state, and CRDT merging resolves it. |
| **API instance killed** | `SIGTERM` stops accepting work, flushes dirty documents, closes sockets and pools, with a 10 s forced-exit guard. Debounced edits at risk are at most about 2 s per document, and they still exist on clients and on other replicas. |
| **Notification handler throws** | Isolated by the event bus and logged. The original request still succeeds. |
| **Slow or unbounded input** | JSON body capped at 200 kB, PDFs at 2 MB, Yjs updates at 256 KB, documents at 200k characters, chat at 10 messages per 10 s per socket, page size at 50. |

## Observability

- **Logs:** Pino JSON with a `requestId` on every line, the same id returned in the `X-Request-Id` header and in error bodies. Secrets are redacted.
- **Metrics (`/metrics`, Prometheus):**
  - `http_requests_total` and `http_request_duration_seconds`, labelled by **route pattern** to keep cardinality bounded;
  - `socket_events_total` and `ai_requests_total` (by outcome);
  - process memory and uptime.
- **Probes:** `/health` (liveness) and `/ready` (Postgres and Redis).

## Search

Postgres full-text search uses a weighted `tsvector`, a GIN index, `websearch_to_tsquery` (which accepts user syntax safely) and `ts_rank_cd`. That's enough up to millions of rows without another system to run (ADR 0005). Beyond that, or for typo tolerance and facets, I'd add OpenSearch fed by change-data-capture.

## What I'd do next at 10× and 100×

1. **Read replicas** for list and search queries, keeping the primary for writes and transactions.
2. **Session-owner routing** for collaborative documents, or move to `y-redis`.
3. **Outbox pattern** for domain events, so notifications survive a crash between commit and publish (at-least-once delivery).
4. **CDN** for static assets, with `immutable` caching already in place.
5. **Queue** (BullMQ) for AI resume reviews, so long jobs don't hold HTTP connections.
6. **Hot-question cache** with stampede protection.
