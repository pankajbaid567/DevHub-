# ADR 0003: CRDTs (Yjs) for collaborative editing

**Status:** Accepted

## Context

Live sessions need several people editing one document with low latency. They must survive reconnects, and the system must run on more than one API instance.

## Options considered

1. **Last-write-wins** with whole-document broadcasts (the MVP's approach). This loses edits whenever two people type at once.
2. **Operational transformation** (ShareDB). Correct, but it needs a central sequencer per document, which complicates multi-instance deployments.
3. **CRDT (Yjs).** Updates are commutative and idempotent, so any replica can apply them in any order, and duplicates are harmless.

## Decision

Use Yjs, bound to Monaco with `y-monaco`, and send binary updates over the existing authenticated Socket.IO connection (so there's no second WebSocket server to run).

- The server keeps one Y.Doc per active session per instance, validates update size and document size, and relays updates to other instances with `serverSideEmit`.
- Persistence is debounced and **merging**: under a row lock, the stored state and the instance's state are CRDT-merged, so instances can never overwrite each other.
- Awareness (cursors, names) is relayed but never persisted.

## Consequences

- Offline edits merge cleanly on reconnect, with no conflict handling code.
- At large scale, each instance holds duplicate documents. The upgrade path is session-owner routing, or `y-redis` (see SYSTEM_DESIGN.md).
- Binary payloads must be handled carefully across the Redis adapter. This caused a real bug, now regression-tested.
