# ADR 0004: Transactions for invariants, domain events for side effects

**Status:** Accepted

## Context

A vote changes a vote row, a score, the author's reputation, the voter's reputation (for downvotes) and the ledger, and it should also notify the author.

## Decision

- **Everything that must be consistent** (counters, reputation and its ledger, acceptance bonuses, capacity) happens inside one database transaction in the service. Transactions retry on unique-constraint and serialisation conflicts.
- **Side effects that can lag** (notifications, socket pushes, cache invalidation) subscribe to in-process domain events, published only after commit. A failing subscriber is logged and isolated.

## Consequences

- Reputation can never drift from the votes. Tests assert `users.reputation = SUM(reputation_events.delta)`.
- A crash between commit and publish can drop a notification (at-most-once). That's acceptable for notifications today. The upgrade path is a transactional outbox table drained by a worker, which gives at-least-once delivery.
