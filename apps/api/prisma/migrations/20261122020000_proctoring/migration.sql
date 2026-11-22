-- Proctoring: config column on sessions + events table

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN "proctoringConfig" JSONB;

-- CreateTable
CREATE TABLE "proctoring_events" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proctoring_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "proctoring_events_sessionId_createdAt_idx" ON "proctoring_events"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "proctoring_events_userId_idx" ON "proctoring_events"("userId");

-- AddForeignKey
ALTER TABLE "proctoring_events" ADD CONSTRAINT "proctoring_events_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
