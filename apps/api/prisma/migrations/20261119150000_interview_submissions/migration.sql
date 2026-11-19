-- Test-case submissions for interview problems.


-- CreateTable
CREATE TABLE "interview_submissions" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "problemSlug" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "passed" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "results" JSONB NOT NULL,
    "stdout" TEXT NOT NULL DEFAULT '',
    "stderr" TEXT NOT NULL DEFAULT '',
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "interview_submissions_sessionId_createdAt_idx" ON "interview_submissions"("sessionId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "interview_submissions_userId_createdAt_idx" ON "interview_submissions"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "interview_submissions" ADD CONSTRAINT "interview_submissions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_submissions" ADD CONSTRAINT "interview_submissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

