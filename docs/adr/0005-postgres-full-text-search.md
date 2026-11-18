# ADR 0005: Postgres full-text search instead of a search cluster

**Status:** Accepted

## Decision

Search uses:

- a weighted `tsvector` column (title A, body B), maintained by a trigger;
- a GIN index;
- `websearch_to_tsquery`, which accepts `"phrases"`, `-exclusions` and `or` safely;
- `ts_rank_cd` for ranking.

Candidate ids from full-text search are then combined with the regular filters and sorts in Prisma.

## Why

- No extra system to deploy, secure or keep in sync.
- Good relevance and performance well into millions of rows.
- Triggers keep the vector consistent within the same transaction, with no indexing lag.

## Trade-offs

There's no typo tolerance, synonyms or faceting. At that point I'd add OpenSearch, fed by change-data-capture from Postgres.
