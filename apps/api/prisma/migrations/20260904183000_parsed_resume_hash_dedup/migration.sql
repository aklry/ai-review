-- Failed or in-progress uploads may share a hash so that users can retry parsing.
-- Only successfully parsed documents participate in content deduplication.
DROP INDEX IF EXISTS "ResumeDocument_userKey_sha256_key";
CREATE UNIQUE INDEX "ResumeDocument_userKey_sha256_parsed_key"
ON "ResumeDocument"("userKey", "sha256")
WHERE "parseStatus" = 'parsed';
