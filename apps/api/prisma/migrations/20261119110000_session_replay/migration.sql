-- CreateTable
CREATE TABLE "session_updates" (
    "id" BIGSERIAL NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "update" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_updates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "session_updates_sessionId_id_idx" ON "session_updates"("sessionId", "id");

-- AddForeignKey
ALTER TABLE "session_updates" ADD CONSTRAINT "session_updates_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

