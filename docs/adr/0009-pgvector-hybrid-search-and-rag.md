# ADR 0009: pgvector for semantic search, hybrid ranking and RAG

**Status:** Accepted

## Context

Keyword search misses paraphrases ("stop two users booking one seat" vs "optimistic vs pessimistic locking"). Duplicate questions fragment answers. An AI mentor that ignores the community's accepted answers wastes them, and it can't cite anything.

## Decision

- Store embeddings in **Postgres with pgvector**: one `content_embeddings` row per chunk of a question, answer or public snippet, `vector(768)`, with an **HNSW** cosine index created in a hand-written migration step (Prisma can't express it, and the CI drift check tolerates exactly that index).
- **Gemini `gemini-embedding-001`** with `outputDimensionality = 768` and asymmetric task types (`RETRIEVAL_DOCUMENT` for content, `RETRIEVAL_QUERY` for searches). An offline feature-hashing embedder is used without a key.
- **Hybrid search** = full-text plus vector, fused with reciprocal rank fusion (k = 60).
- **RAG** for the mentor: the best chunk per document, re-ranked with accepted and vote signals, top 5 passed as tagged untrusted data, with `[n]` citations streamed and stored.
- Asynchronous indexing (jobs), content-hash skipping, and a reconcile sweep keyed on the model name. Thresholds are calibrated on measured similarities and documented in code.

## Why not …

- **A dedicated vector database** (Pinecone, Qdrant, Weaviate): another system to secure, pay for and keep consistent with Postgres. pgvector handles millions of vectors and joins directly with questions, votes and visibility in one query.
- **Embedding on write, synchronously:** it ties posting latency and availability to an external API.
- **Vector-only search:** it loses exact matches on error strings and identifiers, where full-text excels.

## Consequences

- Similarity thresholds are model-specific. Changing models means re-calibrating (the reconcile job re-embeds automatically).
- Short, single-word queries embed weakly, and the keyword half of hybrid search covers them.
- At very large scale: `halfvec`, partitioning by kind, or moving vectors out. The `Embedder` and `SearchService` interfaces isolate that change.
