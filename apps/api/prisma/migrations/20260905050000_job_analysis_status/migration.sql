-- AlterTable
ALTER TABLE "Job" ADD COLUMN "analysisStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "Job" ADD COLUMN "analysisError" TEXT;
ALTER TABLE "Job" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill
UPDATE "Job" SET "analysisStatus" = 'completed' WHERE "analysis" IS NOT NULL;
UPDATE "Job" SET "analysisStatus" = 'pending' WHERE "analysis" IS NULL;
UPDATE "Job" SET "updatedAt" = "createdAt";

-- AlterTable
ALTER TABLE "Job" ALTER COLUMN "updatedAt" DROP DEFAULT;