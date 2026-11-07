ALTER TABLE "InterviewSession" ADD COLUMN "feedbackPolicy" TEXT NOT NULL DEFAULT 'immediate',
  ADD COLUMN "deadlineAt" TIMESTAMP(3), ADD COLUMN "pausedAt" TIMESTAMP(3);
ALTER TABLE "InterviewQuestion" ADD COLUMN "skippedAt" TIMESTAMP(3);
ALTER TABLE "CoachingCue" ADD COLUMN "dispute" TEXT, ADD COLUMN "referenceViewedAt" TIMESTAMP(3);
CREATE TABLE "PracticeTask" (
  "id" TEXT PRIMARY KEY,
  "sourceQuestionId" TEXT NOT NULL REFERENCES "InterviewQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "criterionId" TEXT NOT NULL,
  "questions" JSONB NOT NULL,
  "attempts" JSONB NOT NULL DEFAULT '[]',
  "stage" INTEGER NOT NULL DEFAULT 0,
  "freshKey" TEXT UNIQUE,
  "leaseToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  UNIQUE ("sourceQuestionId", "criterionId")
);
