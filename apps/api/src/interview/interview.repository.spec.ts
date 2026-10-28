import { describe, expect, it, vi } from 'vitest';
import { InterviewRepository } from './interview.repository.js';
import { Prisma } from '../generated/prisma/client.js';

describe('InterviewRepository durable jobs', () => {
  it('persists a profile through Prisma', async () => {
    const create = vi.fn(async ({ data }: { data: unknown }) => data);
    const repository = new InterviewRepository({ candidateProfile: { create } } as never);
    await expect(
      repository.createProfile({
        resumeText: 'A sufficiently long resume for this test.',
        displayName: 'Ada',
      }),
    ).resolves.toMatchObject({ userKey: 'local-user', displayName: 'Ada' });
  });

  it('deduplicates jobs using the candidate facts and pipeline input hash', async () => {
    const upsert = vi.fn(async () => ({ id: 'j1' }));
    const repository = new InterviewRepository({ job: { upsert } } as never);
    await repository.createWorkflowJob(
      {
        profileId: 'p1',
        targetRole: 'Engineer',
        jobDescription: 'Build reliable applications with AI.',
      },
      'facts-hash',
    );
    expect(upsert).toHaveBeenCalledWith({
      where: { inputHash: 'facts-hash' },
      update: {},
      create: expect.objectContaining({ inputHash: 'facts-hash', analysisStatus: 'processing' }),
    });
  });

  it.each([0, 1])('conditionally retries failed jobs (%i)', async (count) => {
    const updateMany = vi.fn(async () => ({ count }));
    const repository = new InterviewRepository({ job: { updateMany } } as never);
    await expect(repository.retryFailedJob('j1')).resolves.toBe(count === 1);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'j1', analysisStatus: 'failed' },
      data: {
        analysis: Prisma.DbNull,
        analysisStatus: 'processing',
        analysisError: null,
        analysisLeaseOwner: null,
        analysisLeaseUntil: null,
        analysisAttempts: 0,
      },
    });
  });

  it('claims only recoverable work within the attempt limit', async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const repository = new InterviewRepository({ job: { updateMany } } as never);
    await expect(repository.claimJob('j1', 'worker', new Date())).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          analysisStatus: 'processing',
          analysisAttempts: { lt: 3 },
        }),
        data: expect.objectContaining({
          analysisAttempts: { increment: 1 },
          analysisLeaseOwner: 'worker',
        }),
      }),
    );
  });

  it('fails exhausted work before listing bounded recoverable jobs', async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const findMany = vi.fn(async () => [{ id: 'recoverable' }]);
    const repository = new InterviewRepository({ job: { updateMany, findMany } } as never);
    await expect(repository.recoverableJobs()).resolves.toEqual([{ id: 'recoverable' }]);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ analysisAttempts: { gte: 3 } }),
        data: expect.objectContaining({ analysisStatus: 'failed' }),
      }),
    );
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 5,
        where: expect.objectContaining({ analysisAttempts: { lt: 3 } }),
      }),
    );
  });

  it('rejects completion after another worker reclaimed a lease', async () => {
    const updateMany = vi.fn(async () => ({ count: 0 }));
    const repository = new InterviewRepository({ job: { updateMany } } as never);
    await expect(
      repository.completeJob('j1', 'stale-worker', {
        summary: 'Analysis',
        competencies: [],
        likelyQuestions: [],
        missingEvidence: [],
      }),
    ).rejects.toThrow(/lease was lost/);
  });
});
