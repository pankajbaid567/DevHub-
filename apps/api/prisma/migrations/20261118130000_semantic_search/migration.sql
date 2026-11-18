-- pgvector for semantic search and RAG retrieval.
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable
ALTER TABLE "mentor_messages" ADD COLUMN     "sources" JSONB;

-- CreateTable
CREATE TABLE "content_embeddings" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "chunk" INTEGER NOT NULL DEFAULT 0,
    "questionId" TEXT,
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "embedding" vector(768) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "content_embeddings_kind_model_idx" ON "content_embeddings"("kind", "model");

-- CreateIndex
CREATE UNIQUE INDEX "content_embeddings_kind_refId_chunk_key" ON "content_embeddings"("kind", "refId", "chunk");


-- Approximate nearest-neighbour index for cosine distance (the <=> operator).
-- HNSW: better recall/latency trade-off than IVFFlat and no training step.
CREATE INDEX "content_embeddings_embedding_hnsw" ON "content_embeddings"
  USING hnsw ("embedding" vector_cosine_ops) WITH (m = 16, ef_construction = 64);
