-- DropIndex
DROP INDEX "ResumeDocument_sha256_idx";

-- CreateIndex
CREATE INDEX "ResumeDocument_userKey_sha256_idx" ON "ResumeDocument"("userKey", "sha256");
