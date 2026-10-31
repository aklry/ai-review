import { describe, expect, it, vi } from 'vitest';
import { InterviewRepository } from './interview.repository.js';

const startedAt = new Date('2026-10-29T01:00:00.000Z');
const cue = {
  competency: 'project-depth',
  score: 4,
  strengths: ['具体'],
  gaps: [],
  nextAction: '补充取舍',
  evidence: [{ source: 'answer', quote: '降低了延迟' }],
  followUpQuestion: null,
};
function record() {
  return {
    id: 's1',
    status: 'active',
    startedAt,
    endedAt: null,
    activeQuestionId: 'followup',
    plan: {
      language: 'zh-CN',
      round: 'technical',
      difficulty: 'l2',
      profile: { userKey: 'local-user', resumeText: 'PRIVATE RESUME' },
      job: { targetRole: '前端工程师', company: null, description: 'PRIVATE JD' },
    },
    questions: [
      {
        id: 'q1',
        order: 0,
        parentQuestionId: null,
        competency: 'project-depth',
        difficulty: 'l2',
        isCore: true,
        prompt: '介绍一个项目',
        answer: {
          id: 'a1',
          answerText: '降低了延迟',
          createdAt: startedAt,
          cue,
          requestHash: 'PRIVATE HASH',
        },
      },
      {
        id: 'followup',
        order: 2,
        parentQuestionId: 'q1',
        competency: 'project-depth',
        difficulty: 'l2',
        isCore: false,
        prompt: '如何测量？',
        answer: null,
      },
      {
        id: 'q2',
        order: 1,
        parentQuestionId: null,
        competency: 'system-design',
        difficulty: 'l2',
        isCore: true,
        prompt: '如何设计缓存？',
        answer: null,
      },
    ],
    report: null,
  };
}

describe('interview history projections', () => {
  it('lists bounded local-user history in stable newest-first order and counts only main answers', async () => {
    const findMany = vi.fn(async () => [record()]);
    const count = vi.fn(async () => 21);
    const repository = new InterviewRepository({ interviewSession: { findMany, count } } as never);
    const result = await repository.listSessions({ page: 2, pageSize: 10, status: 'active' });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        where: { status: 'active', plan: { profile: { userKey: 'local-user' } } },
      }),
    );
    expect(count).toHaveBeenCalledWith({
      where: { status: 'active', plan: { profile: { userKey: 'local-user' } } },
    });
    expect(result).toMatchObject({
      page: 2,
      pageSize: 10,
      total: 21,
      items: [
        {
          id: 's1',
          startedAt: startedAt.toISOString(),
          mainQuestionCount: 2,
          answeredMainQuestionCount: 1,
          followUpCount: 1,
          report: null,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|降低了延迟|介绍一个项目/);
  });

  it('returns all answers and evidence, preserves follow-up association and hides internal data', async () => {
    const findFirst = vi.fn(async () => record());
    const repository = new InterviewRepository({ interviewSession: { findFirst } } as never);
    const result = await repository.getSessionReview('s1');
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 's1', plan: { profile: { userKey: 'local-user' } } },
      }),
    );
    expect(result.questions).toHaveLength(3);
    expect(result.questions[0]?.answer).toMatchObject({
      answerText: '降低了延迟',
      cue: { score: 4 },
    });
    expect(result.questions[0]?.answer?.cue).not.toHaveProperty('followUpQuestion');
    expect(result.questions.find((q) => q.id === 'followup')).toMatchObject({
      parentQuestionId: 'q1',
      answer: null,
    });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|requestHash|lease/);
  });

  it('returns a 404 for missing or out-of-scope sessions', async () => {
    const repository = new InterviewRepository({
      interviewSession: { findFirst: vi.fn(async () => null) },
    } as never);
    await expect(repository.getSessionReview('missing')).rejects.toMatchObject({ status: 404 });
  });

  it('keeps valid legacy report plans readable without weakening new report validation', async () => {
    const report = {
      summary: '历史报告',
      overallScore: 64,
      scoringVersion: 'legacy-v1',
      competencyScores: {
        'vue-react': 3,
        'ai-application': 3,
        'system-design': 3,
        'project-depth': 4,
      },
      strengths: ['交付'],
      gaps: [],
      nextPlan: Array.from({ length: 7 }, () => ({
        day: 1,
        focus: 'project-depth',
        task: '复盘',
        reason: '巩固',
      })),
    };
    const findFirst = vi.fn(async () => ({ ...record(), report }));
    const repository = new InterviewRepository({ interviewSession: { findFirst } } as never);
    await expect(repository.getSessionReview('s1')).resolves.toMatchObject({
      report: { overallScore: 64, nextPlan: report.nextPlan },
    });
    findFirst.mockResolvedValue({
      ...record(),
      report: { ...report, scoringVersion: 'evidence-v2' },
    });
    await expect(repository.getSessionReview('s1')).rejects.toThrow();
  });
});
