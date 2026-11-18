# ADR 0008: Transactional outbox and BullMQ for background work

**Status:** Accepted

## Context

Emails (verification, password reset, notifications), session reminders and search indexing must not run on the request path, and the first three must not be lost. Publishing to a queue after commit has a window where a crash or a Redis outage silently drops the job. Publishing before commit can send an email for a sign-up that then rolls back.

## Decision

- **Outbox table.** Services write `outbox(topic, payload, availableAt)` rows **inside their own transaction**. A relay on every replica claims due rows with `FOR UPDATE SKIP LOCKED`, adds them to BullMQ with `jobId = outbox-<row id>` and marks them dispatched. Rows due more than an hour out stay in Postgres.
- **BullMQ on Redis** for execution: competing consumers on every replica (`WORKER_ENABLED`), 5 attempts with exponential backoff, failed jobs retained for 7 days as a dead-letter set, and repeatable jobs deduplicated across replicas.
- **Idempotent handlers.** Delivery is at-least-once, so each handler claims or checks state atomically (for example a conditional `UPDATE … RETURNING` for reminders).
- **Same semantics without Redis.** An in-process `InlineJobQueue` (retries, delays, idempotent ids, BullMQ's id rules) runs the same handlers in tests and single-instance development.
- **Low-urgency, rebuildable work** (search indexing) is enqueued straight from a domain event, without the outbox. A periodic reconcile job repairs anything missed.

## Why not …

- **Kafka or RabbitMQ:** another stateful cluster to run for a workload of a few jobs per second. Redis is already required for Socket.IO and rate limits.
- **Postgres-only queue (pg-boss, graphile-worker):** a reasonable choice. BullMQ was preferred for its mature retry, scheduling and dashboard ecosystem, and the outbox already gives Postgres-grade durability where it matters.
- **Change data capture (Debezium):** the right tool at a larger scale. Overkill here, and the outbox table is CDC-ready if it's ever needed.

## Consequences

- Up to about 2 s latency (the poll interval) if the post-commit `poke()` is missed. In practice it's milliseconds.
- The outbox needs pruning (handled by the hourly `maintenance.cleanup` job) and poison-row protection (quadratic backoff on relay failure).
- Redis must run with persistence and `noeviction`.
