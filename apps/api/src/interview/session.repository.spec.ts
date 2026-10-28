import { describe, expect, it, vi } from 'vitest';
import type { CoachingCue, EvaluationReport } from '@interview-assistant/contracts';
import { SessionRepository, type TurnCommit } from './session.repository.js';

const cue: CoachingCue = {
  competency: 'project-depth',
  score: 4,
  strengths: ['evidence'],
  gaps: ['validation'],
  nextAction: 'Validate.',
  evidence: [{ source: 'answer', quote: 'delivered' }],
};
const commit: TurnCommit = {
  sessionId: 's1',
  questionId: 'q1',
  answerText: 'I delivered the project.',
  requestHash: 'hash',
  cue,
  expectedVersion: 2,
  leaseToken: 'owner',
  response: {
    cue,
    nextQuestion: {
      id: 'followup-q1',
      parentQuestionId: 'q1',
      prompt: 'How?',
      competency: 'project-depth',
      difficulty: 'l2',
      isCore: false,
    },
    model: 'fixture',
    degraded: false,
    currentQuestionIndex: 0,
    activeQuestionId: 'followup-q1',
    status: 'active',
  },
};

function setup(count = 1) {
  const tx = {
    interviewSession: {
      updateMany: vi.fn(async () => ({ count })),
      create: vi.fn(async () => ({ id: 's1' })),
      update: vi.fn(async () => ({})),
    },
    interviewPlan: { create: vi.fn(async () => ({ id: 'p1' })) },
    interviewQuestion: {
      create: vi.fn(async () => ({})),
      createMany: vi.fn(async () => ({ count: 2 })),
    },
    interviewAnswer: { create: vi.fn(async () => ({ id: 'a1' })) },
    coachingCue: { create: vi.fn(async () => ({ id: 'c1' })) },
    evaluationReport: { create: vi.fn(async () => ({ id: 'r1' })) },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn(async <T>(fn: (client: typeof tx) => Promise<T>) => fn(tx)),
  };
  return { tx, prisma, repository: new SessionRepository(prisma as never) };
}

describe('SessionRepository atomic transitions', () => {
  it('creates plan, questions and active cursor in one transaction with scoped IDs', async () => {
    const { repository, prisma, tx } = setup();
    const question = {
      id: 'same-model-id',
      prompt: 'Describe it.',
      competency: 'project-depth' as const,
      difficulty: 'l2' as const,
      isCore: true,
    };
    const result = await repository.create(
      {
        profileId: 'profile1',
        jobId: 'job1',
        language: 'zh-CN',
        round: 'technical',
        difficulty: 'l2',
        questionCount: 2,
      },
      [question, question],
    );
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(result.questions.map((q) => q.id)).toEqual(['s1:0:same-model-id', 's1:1:same-model-id']);
    expect(tx.interviewSession.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { activeQuestionId: 's1:0:same-model-id' },
    });
  });

  it('requires version, active question and lease ownership before any turn insert', async () => {
    const { repository, tx } = setup();
    await expect(repository.commit(commit)).resolves.toEqual(commit.response);
    expect(tx.interviewSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 's1',
          version: 2,
          status: 'active',
          activeQuestionId: 'q1',
          turnLeaseToken: 'owner',
        },
        data: expect.objectContaining({ version: { increment: 1 }, currentQuestionIndex: 0 }),
      }),
    );
    expect(tx.interviewQuestion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ parentQuestionId: 'q1', order: 1000 }),
      }),
    );
    expect(tx.interviewAnswer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ requestHash: 'hash', result: commit.response }),
      }),
    );
    expect(tx.coachingCue.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ answerId: 'a1', score: 4 }) }),
    );
  });

  it('makes no answer, follow-up or cue writes after a stale CAS', async () => {
    const { repository, tx } = setup(0);
    await expect(repository.commit(commit)).rejects.toThrow(/state changed/);
    expect(tx.interviewAnswer.create).not.toHaveBeenCalled();
    expect(tx.interviewQuestion.create).not.toHaveBeenCalled();
    expect(tx.coachingCue.create).not.toHaveBeenCalled();
  });

  it.each([0, 1])('claims a session iff exactly one row matches (%i)', async (count) => {
    const { repository, tx } = setup(count);
    await expect(repository.claim('s1', 2, 'owner', new Date())).resolves.toBe(count === 1);
    expect(tx.interviewSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 's1',
          version: 2,
          status: { in: ['active', 'awaiting_finish'] },
          OR: expect.any(Array),
        }),
      }),
    );
  });

  it('commits nullable report scores and terminal state atomically', async () => {
    const { repository, tx, prisma } = setup();
    await repository.finish(
      's1',
      {
        overallScore: null,
        competencyScores: {
          'vue-react': null,
          'ai-application': null,
          'system-design': null,
          'project-depth': 4,
        },
        scoringVersion: 'evidence-v2',
        assessmentStatus: 'partial',
        cues: [cue],
        summary: 'Partial',
        strengths: [],
        gaps: [],
        nextPlan: [],
      } satisfies EvaluationReport,
      2,
      'owner',
    );
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.evaluationReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ overallScore: null, scoringVersion: 'evidence-v2' }),
      }),
    );
    expect(tx.interviewSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'completed',
          activeQuestionId: null,
          version: { increment: 1 },
        }),
      }),
    );
  });

  it('does not create a report after losing the session lease', async () => {
    const { repository, tx } = setup(0);
    await expect(repository.finish('s1', {} as EvaluationReport, 2, 'stale')).rejects.toThrow(
      /state changed/,
    );
    expect(tx.evaluationReport.create).not.toHaveBeenCalled();
  });
});
