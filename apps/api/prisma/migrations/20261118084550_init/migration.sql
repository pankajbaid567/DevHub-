-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PUBLIC', 'UNLISTED', 'PRIVATE');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('LIVE', 'SCHEDULED', 'ENDED');

-- CreateEnum
CREATE TYPE "SessionVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "ParticipantRole" AS ENUM ('HOST', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "VoteTarget" AS ENUM ('QUESTION', 'ANSWER');

-- CreateEnum
CREATE TYPE "ReputationReason" AS ENUM ('QUESTION_VOTE', 'ANSWER_VOTE', 'ANSWER_ACCEPTED', 'DOWNVOTE_CAST');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ANSWER_POSTED', 'ANSWER_ACCEPTED', 'CONTENT_UPVOTED', 'SNIPPET_STARRED', 'SESSION_STARTED');

-- CreateEnum
CREATE TYPE "MentorRole" AS ENUM ('user', 'assistant');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "bio" TEXT,
    "avatarUrl" TEXT,
    "reputation" INTEGER NOT NULL DEFAULT 0,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedBy" TEXT,
    "userAgent" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "answerCount" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "acceptedAnswerId" TEXT,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "searchVector" tsvector,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answers" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "questionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "votes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "target" "VoteTarget" NOT NULL,
    "questionId" TEXT,
    "answerId" TEXT,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reputation_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" "ReputationReason" NOT NULL,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reputation_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "snippets" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "visibility" "Visibility" NOT NULL DEFAULT 'PUBLIC',
    "starCount" INTEGER NOT NULL DEFAULT 0,
    "forkCount" INTEGER NOT NULL DEFAULT 0,
    "forkedFromId" TEXT,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "searchVector" tsvector,

    CONSTRAINT "snippets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "snippet_stars" (
    "userId" TEXT NOT NULL,
    "snippetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "snippet_stars_pkey" PRIMARY KEY ("userId","snippetId")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "language" TEXT NOT NULL DEFAULT 'javascript',
    "status" "SessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "visibility" "SessionVisibility" NOT NULL DEFAULT 'PUBLIC',
    "inviteCode" TEXT,
    "maxParticipants" INTEGER NOT NULL DEFAULT 10,
    "code" TEXT NOT NULL DEFAULT '',
    "docState" BYTEA,
    "scheduledFor" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "hostId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_participants" (
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ParticipantRole" NOT NULL DEFAULT 'EDITOR',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_participants_pkey" PRIMARY KEY ("sessionId","userId")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" "NotificationType" NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_ratings" (
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_ratings_pkey" PRIMARY KEY ("userId","name")
);

-- CreateTable
CREATE TABLE "mentor_conversations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topic" TEXT NOT NULL DEFAULT 'general',
    "title" TEXT NOT NULL DEFAULT 'New conversation',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mentor_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentor_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "MentorRole" NOT NULL,
    "content" TEXT NOT NULL,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mentor_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resume_reviews" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT,
    "targetRole" TEXT,
    "result" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resume_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_QuestionToTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_QuestionToTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_SnippetToTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_SnippetToTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_SessionToTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_SessionToTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_reputation_idx" ON "users"("reputation" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_familyId_idx" ON "refresh_tokens"("familyId");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "questions_acceptedAnswerId_key" ON "questions"("acceptedAnswerId");

-- CreateIndex
CREATE INDEX "questions_createdAt_idx" ON "questions"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "questions_score_idx" ON "questions"("score" DESC);

-- CreateIndex
CREATE INDEX "questions_lastActivityAt_idx" ON "questions"("lastActivityAt" DESC);

-- CreateIndex
CREATE INDEX "questions_authorId_idx" ON "questions"("authorId");

-- CreateIndex
CREATE INDEX "questions_searchVector_idx" ON "questions" USING GIN ("searchVector");

-- CreateIndex
CREATE INDEX "answers_questionId_score_idx" ON "answers"("questionId", "score" DESC);

-- CreateIndex
CREATE INDEX "answers_authorId_idx" ON "answers"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "votes_userId_questionId_key" ON "votes"("userId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "votes_userId_answerId_key" ON "votes"("userId", "answerId");

-- CreateIndex
CREATE INDEX "reputation_events_userId_createdAt_idx" ON "reputation_events"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "snippets_visibility_createdAt_idx" ON "snippets"("visibility", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "snippets_visibility_starCount_idx" ON "snippets"("visibility", "starCount" DESC);

-- CreateIndex
CREATE INDEX "snippets_authorId_idx" ON "snippets"("authorId");

-- CreateIndex
CREATE INDEX "snippets_language_idx" ON "snippets"("language");

-- CreateIndex
CREATE INDEX "snippets_searchVector_idx" ON "snippets" USING GIN ("searchVector");

-- CreateIndex
CREATE INDEX "snippet_stars_snippetId_idx" ON "snippet_stars"("snippetId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_inviteCode_key" ON "sessions"("inviteCode");

-- CreateIndex
CREATE INDEX "sessions_visibility_status_createdAt_idx" ON "sessions"("visibility", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "sessions_hostId_idx" ON "sessions"("hostId");

-- CreateIndex
CREATE INDEX "session_participants_userId_idx" ON "session_participants"("userId");

-- CreateIndex
CREATE INDEX "messages_sessionId_createdAt_id_idx" ON "messages"("sessionId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_id_idx" ON "notifications"("userId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");

-- CreateIndex
CREATE INDEX "mentor_conversations_userId_updatedAt_idx" ON "mentor_conversations"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "mentor_messages_conversationId_createdAt_idx" ON "mentor_messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "resume_reviews_userId_createdAt_idx" ON "resume_reviews"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "_QuestionToTag_B_index" ON "_QuestionToTag"("B");

-- CreateIndex
CREATE INDEX "_SnippetToTag_B_index" ON "_SnippetToTag"("B");

-- CreateIndex
CREATE INDEX "_SessionToTag_B_index" ON "_SessionToTag"("B");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_acceptedAnswerId_fkey" FOREIGN KEY ("acceptedAnswerId") REFERENCES "answers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answers" ADD CONSTRAINT "answers_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "answers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reputation_events" ADD CONSTRAINT "reputation_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snippets" ADD CONSTRAINT "snippets_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snippets" ADD CONSTRAINT "snippets_forkedFromId_fkey" FOREIGN KEY ("forkedFromId") REFERENCES "snippets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snippet_stars" ADD CONSTRAINT "snippet_stars_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snippet_stars" ADD CONSTRAINT "snippet_stars_snippetId_fkey" FOREIGN KEY ("snippetId") REFERENCES "snippets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_ratings" ADD CONSTRAINT "skill_ratings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentor_conversations" ADD CONSTRAINT "mentor_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentor_messages" ADD CONSTRAINT "mentor_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "mentor_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_reviews" ADD CONSTRAINT "resume_reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_QuestionToTag" ADD CONSTRAINT "_QuestionToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_QuestionToTag" ADD CONSTRAINT "_QuestionToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SnippetToTag" ADD CONSTRAINT "_SnippetToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "snippets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SnippetToTag" ADD CONSTRAINT "_SnippetToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SessionToTag" ADD CONSTRAINT "_SessionToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SessionToTag" ADD CONSTRAINT "_SessionToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- -------------------------------------------------------------------------
-- Hand-written additions (Prisma cannot express these declaratively)
-- ---------------------------------------------------------------------------

-- A vote targets exactly one of question / answer, and its value is +1 or -1.
ALTER TABLE "votes"
  ADD CONSTRAINT "votes_exactly_one_target"
    CHECK (num_nonnulls("questionId", "answerId") = 1),
  ADD CONSTRAINT "votes_value_is_unit"
    CHECK ("value" IN (-1, 1)),
  ADD CONSTRAINT "votes_target_matches"
    CHECK (("target" = 'QUESTION' AND "questionId" IS NOT NULL)
        OR ("target" = 'ANSWER' AND "answerId" IS NOT NULL));

ALTER TABLE "skill_ratings"
  ADD CONSTRAINT "skill_ratings_range" CHECK ("rating" BETWEEN 1 AND 10);

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_capacity_range" CHECK ("maxParticipants" BETWEEN 2 AND 50);

-- Counters can never go negative.
ALTER TABLE "questions"
  ADD CONSTRAINT "questions_counters_nonneg" CHECK ("answerCount" >= 0 AND "viewCount" >= 0);
ALTER TABLE "snippets"
  ADD CONSTRAINT "snippets_counters_nonneg" CHECK ("starCount" >= 0 AND "forkCount" >= 0);

-- Full-text search: weighted tsvector maintained by triggers (title weighs more than body).
CREATE FUNCTION questions_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW."searchVector" :=
    setweight(to_tsvector('english', coalesce(NEW."title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce(left(NEW."body", 20000), '')), 'B');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER questions_search_vector_trigger
  BEFORE INSERT OR UPDATE OF "title", "body" ON "questions"
  FOR EACH ROW EXECUTE FUNCTION questions_search_vector_update();

CREATE FUNCTION snippets_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW."searchVector" :=
    setweight(to_tsvector('english', coalesce(NEW."title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW."description", '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(left(NEW."code", 5000), '')), 'D');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER snippets_search_vector_trigger
  BEFORE INSERT OR UPDATE OF "title", "description", "code" ON "snippets"
  FOR EACH ROW EXECUTE FUNCTION snippets_search_vector_update();
