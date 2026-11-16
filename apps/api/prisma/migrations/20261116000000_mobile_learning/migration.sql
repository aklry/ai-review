CREATE TABLE "LearningItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userKey" TEXT NOT NULL DEFAULT 'local-user',
  "sourceKey" TEXT NOT NULL,
  "question" JSONB NOT NULL,
  "language" TEXT NOT NULL DEFAULT 'zh-CN',
  "bookmarked" BOOLEAN NOT NULL DEFAULT false,
  "reviewStatus" TEXT NOT NULL DEFAULT 'none',
  "attempts" JSONB NOT NULL DEFAULT '[]',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "firstScore" INTEGER,
  "latestScore" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 0,
  "leaseToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "LearningItem_userKey_sourceKey_key" ON "LearningItem"("userKey", "sourceKey");
CREATE INDEX "LearningItem_userKey_reviewStatus_updatedAt_idx" ON "LearningItem"("userKey", "reviewStatus", "updatedAt");
CREATE TABLE "DailyLearning" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userKey" TEXT NOT NULL DEFAULT 'local-user',
  "day" TEXT NOT NULL,
  "initialAttemptCount" INTEGER NOT NULL DEFAULT 0,
  "itemId" TEXT NOT NULL REFERENCES "LearningItem"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DailyLearning_userKey_day_key" ON "DailyLearning"("userKey", "day");
