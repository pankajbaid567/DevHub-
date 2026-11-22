-- Problem progress, bookmarks, notes, CP profiles, badges, whiteboards

CREATE TYPE "ProblemStatus" AS ENUM ('ATTEMPTED', 'SOLVED');

CREATE TABLE "problem_progress" (
    "userId" TEXT NOT NULL,
    "problemSlug" TEXT NOT NULL,
    "status" "ProblemStatus" NOT NULL DEFAULT 'ATTEMPTED',
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "bestPassed" INTEGER NOT NULL DEFAULT 0,
    "bestTotal" INTEGER NOT NULL DEFAULT 0,
    "language" TEXT,
    "solvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "problem_progress_pkey" PRIMARY KEY ("userId","problemSlug")
);

CREATE TABLE "problem_bookmarks" (
    "userId" TEXT NOT NULL,
    "problemSlug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "problem_bookmarks_pkey" PRIMARY KEY ("userId","problemSlug")
);

CREATE TABLE "problem_notes" (
    "userId" TEXT NOT NULL,
    "problemSlug" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "problem_notes_pkey" PRIMARY KEY ("userId","problemSlug")
);

CREATE TABLE "cp_platform_profiles" (
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "stats" JSONB,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cp_platform_profiles_pkey" PRIMARY KEY ("userId","platform")
);

CREATE TABLE "user_badges" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "badge" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_badges_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whiteboards" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Untitled',
    "data" JSONB NOT NULL,
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whiteboards_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "problem_progress_userId_status_idx" ON "problem_progress"("userId", "status");
CREATE INDEX "user_badges_userId_idx" ON "user_badges"("userId");
CREATE UNIQUE INDEX "user_badges_userId_badge_key" ON "user_badges"("userId", "badge");
CREATE INDEX "whiteboards_userId_updatedAt_idx" ON "whiteboards"("userId", "updatedAt" DESC);

-- Foreign keys
ALTER TABLE "problem_progress" ADD CONSTRAINT "problem_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "problem_bookmarks" ADD CONSTRAINT "problem_bookmarks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "problem_notes" ADD CONSTRAINT "problem_notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cp_platform_profiles" ADD CONSTRAINT "cp_platform_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whiteboards" ADD CONSTRAINT "whiteboards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whiteboards" ADD CONSTRAINT "whiteboards_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
