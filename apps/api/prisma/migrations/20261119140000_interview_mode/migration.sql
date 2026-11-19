-- Interview mode: problem snapshot and server-kept timer on sessions, private scorecards,
-- and AI feedback on practice interviews.

-- CreateEnum
CREATE TYPE "SessionMode" AS ENUM ('PAIRING', 'INTERVIEW');

-- CreateEnum
CREATE TYPE "Recommendation" AS ENUM ('STRONG_NO', 'NO', 'YES', 'STRONG_YES');

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "durationMinutes" INTEGER,
ADD COLUMN     "interviewEndedAt" TIMESTAMP(3),
ADD COLUMN     "interviewEndsAt" TIMESTAMP(3),
ADD COLUMN     "interviewStartedAt" TIMESTAMP(3),
ADD COLUMN     "mode" "SessionMode" NOT NULL DEFAULT 'PAIRING',
ADD COLUMN     "problemSlug" TEXT,
ADD COLUMN     "problemStatement" TEXT,
ADD COLUMN     "problemTitle" TEXT;

-- CreateTable
CREATE TABLE "interview_scorecards" (
    "sessionId" TEXT NOT NULL,
    "interviewerId" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "ratings" JSONB NOT NULL DEFAULT '{}',
    "recommendation" "Recommendation",
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_scorecards_pkey" PRIMARY KEY ("sessionId","interviewerId")
);

-- CreateTable
CREATE TABLE "interview_feedback" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "transcript" JSONB NOT NULL,
    "code" TEXT NOT NULL DEFAULT '',
    "feedback" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "interview_feedback_userId_createdAt_idx" ON "interview_feedback"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "interview_feedback_sessionId_idx" ON "interview_feedback"("sessionId");

-- AddForeignKey
ALTER TABLE "interview_scorecards" ADD CONSTRAINT "interview_scorecards_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_scorecards" ADD CONSTRAINT "interview_scorecards_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_feedback" ADD CONSTRAINT "interview_feedback_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_feedback" ADD CONSTRAINT "interview_feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

