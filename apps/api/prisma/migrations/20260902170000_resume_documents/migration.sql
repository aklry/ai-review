-- AlterTable
ALTER TABLE "CandidateProfile" ADD COLUMN "resumeSource" TEXT NOT NULL DEFAULT 'text';

-- CreateTable
CREATE TABLE "ResumeDocument" (
    "id" TEXT NOT NULL,
    "profileId" TEXT,
    "userKey" TEXT NOT NULL DEFAULT 'local-user',
    "bucket" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "parseStatus" TEXT NOT NULL DEFAULT 'pending',
    "parseError" TEXT,
    "parserVersion" TEXT NOT NULL DEFAULT 'resume-parser-v1',
    "extractedChars" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parsedAt" TIMESTAMP(3),

    CONSTRAINT "ResumeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ResumeDocument_profileId_key" ON "ResumeDocument"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "ResumeDocument_objectKey_key" ON "ResumeDocument"("objectKey");

-- CreateIndex
CREATE INDEX "ResumeDocument_userKey_createdAt_idx" ON "ResumeDocument"("userKey", "createdAt");

-- CreateIndex
CREATE INDEX "ResumeDocument_sha256_idx" ON "ResumeDocument"("sha256");

-- CreateIndex
CREATE INDEX "ResumeDocument_parseStatus_idx" ON "ResumeDocument"("parseStatus");

-- AddForeignKey
ALTER TABLE "ResumeDocument" ADD CONSTRAINT "ResumeDocument_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CandidateProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
