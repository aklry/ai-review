ALTER TABLE "CandidateProfile" ADD COLUMN "structuredResumeHash" TEXT;
ALTER TABLE "Job" ADD COLUMN "inputHash" TEXT,
  ADD COLUMN "analysisLeaseOwner" TEXT,
  ADD COLUMN "analysisLeaseUntil" TIMESTAMP(3),
  ADD COLUMN "analysisAttempts" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "Job_inputHash_key" ON "Job"("inputHash");
ALTER TABLE "InterviewSession" ADD COLUMN "activeQuestionId" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "turnLeaseToken" TEXT,
  ADD COLUMN "turnLeaseUntil" TIMESTAMP(3);
ALTER TABLE "InterviewQuestion" ADD COLUMN "parentQuestionId" TEXT;
CREATE INDEX "InterviewQuestion_parentQuestionId_idx" ON "InterviewQuestion"("parentQuestionId");
UPDATE "InterviewQuestion" AS followup SET "parentQuestionId" = base.id
FROM "InterviewQuestion" AS base
WHERE followup."sessionId" = base."sessionId" AND followup."order" >= 1000
  AND base."order" = followup."order" - 1000;
UPDATE "InterviewSession" AS session SET "activeQuestionId" = (
  SELECT question.id FROM "InterviewQuestion" AS question
  LEFT JOIN "InterviewAnswer" AS answer ON answer."questionId" = question.id
  LEFT JOIN "InterviewQuestion" AS parent ON parent.id = question."parentQuestionId"
  WHERE question."sessionId" = session.id AND answer.id IS NULL
  ORDER BY COALESCE(parent."order", question."order") ASC, question."order" ASC LIMIT 1
) WHERE session.status = 'active';
UPDATE "InterviewSession" AS session SET "currentQuestionIndex" = (
  SELECT COUNT(*) FROM "InterviewQuestion" AS base
  LEFT JOIN "InterviewQuestion" AS active ON active.id = session."activeQuestionId"
  LEFT JOIN "InterviewQuestion" AS parent ON parent.id = active."parentQuestionId"
  WHERE base."sessionId" = session.id AND base."parentQuestionId" IS NULL
    AND (active.id IS NULL OR base."order" < COALESCE(parent."order", active."order"))
) WHERE session.status = 'active';
UPDATE "InterviewSession" SET status = 'awaiting_finish'
WHERE status = 'active' AND "activeQuestionId" IS NULL;
ALTER TABLE "InterviewAnswer" ADD COLUMN "requestHash" TEXT, ADD COLUMN "result" JSONB;
ALTER TABLE "EvaluationReport" ALTER COLUMN "overallScore" DROP NOT NULL,
  ADD COLUMN "scoringVersion" TEXT NOT NULL DEFAULT 'legacy-v1';
ALTER TABLE "UsageLedger" ADD COLUMN "operationId" TEXT, ADD COLUMN "promptVersion" TEXT;
