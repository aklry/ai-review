import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ResumeRepository } from './resume.repository.js';

describe('ResumeRepository', () => {
  it('finds a parsed document and its profile by user and content hash', async () => {
    const findFirst = vi.fn(async () => ({
      id: 'document_1',
      parseStatus: 'parsed',
      profile: {
        id: 'profile_1',
        resumeText: 'A sufficiently long parsed resume.',
        displayName: 'Ada',
        resumeSource: 'file',
      },
    }));
    const repository = new ResumeRepository({ resumeDocument: { findFirst } } as never);

    await expect(repository.findParsedByHash('local-user', 'hash_1')).resolves.toMatchObject({
      id: 'document_1',
      profile: { id: 'profile_1' },
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userKey: 'local-user', sha256: 'hash_1', parseStatus: 'parsed' },
        include: { profile: true },
      }),
    );
  });

  it('keeps failed resume records retryable while deduplicating parsed records', () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        'prisma',
        'migrations',
        '20260904183000_parsed_resume_hash_dedup',
        'migration.sql',
      ),
      'utf8',
    );

    expect(migration).toMatch(
      /CREATE UNIQUE INDEX "ResumeDocument_userKey_sha256_parsed_key"[\s\S]*WHERE "parseStatus" = 'parsed'/,
    );
  });
});
