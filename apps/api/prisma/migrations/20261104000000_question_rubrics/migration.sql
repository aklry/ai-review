-- Nullable snapshots preserve existing sessions and reports unchanged.
ALTER TABLE "InterviewQuestion" ADD COLUMN "rubricSnapshot" JSONB;
ALTER TABLE "CoachingCue" ADD COLUMN "rubricEvaluation" JSONB;
