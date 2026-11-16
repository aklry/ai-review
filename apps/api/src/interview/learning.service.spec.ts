import { describe, expect, it, vi } from 'vitest';
import { snapshotFor, topics } from '@interview-assistant/agent-core';
import { LearningService, learningDay } from './learning.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { WorkflowRuntime } from '../agents/workflow-runtime.service.js';

const snapshot = snapshotFor(topics[0]!, 'l2');
const cue = {
  competency: 'vue-react',
  score: 2,
  strengths: ['机制'],
  gaps: ['验证'],
  nextAction: '补充验证',
  evidence: [{ source: 'answer', quote: '回答内容' }],
  rubricEvaluation: {
    bankId: snapshot.bankId,
    questionVersion: snapshot.questionVersion,
    rubricVersion: 'rubric-v3',
    items: snapshot.criteria.map((c, i) => ({
      criterionId: c.id,
      status: i === 0 ? 'met' : 'missing',
      reason: '依据',
      quotes: i === 0 ? ['回答内容'] : [],
    })),
  },
};
function fixture() {
  const row = {
    id: 'item',
    userKey: 'local-user',
    sourceKey: 'bank:q',
    language: 'zh-CN',
    bookmarked: false,
    reviewStatus: 'none',
    version: 0,
    attempts: [] as unknown[],
    attemptCount: 0,
    firstScore: null as number | null,
    latestScore: null as number | null,
    question: {
      id: 'q',
      prompt: '题目',
      competency: 'vue-react',
      difficulty: 'l2',
      isCore: true,
      rubricSnapshot: snapshot,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    leaseToken: null as string | null,
    leaseUntil: null as Date | null,
  };
  const updateMany = vi.fn(
    async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      if (where.version !== undefined && where.version !== row.version) return { count: 0 };
      if (where.OR && row.leaseToken) return { count: 0 };
      if (where.leaseToken && where.leaseToken !== row.leaseToken) return { count: 0 };
      const version = data.version ? row.version + 1 : row.version;
      Object.assign(row, data, { version });
      return { count: 1 };
    },
  );
  const db = {
    learningItem: {
      findFirst: vi.fn(async () => structuredClone(row)),
      updateMany,
      findMany: vi.fn(async () => [structuredClone(row)]),
      count: vi.fn(async () => 1),
      createMany: vi.fn(async () => ({ count: 1 })),
      findUniqueOrThrow: vi.fn(async () => structuredClone(row)),
      update: vi.fn(async () => ({ ...structuredClone(row), bookmarked: true })),
    },
    dailyLearning: {
      findUnique: vi.fn(async () => ({ itemId: row.id, initialAttemptCount: 0 })),
      createMany: vi.fn(async () => ({ count: 1 })),
      findUniqueOrThrow: vi.fn(async () => ({ itemId: row.id, initialAttemptCount: 0 })),
    },
    interviewQuestion: { findFirst: vi.fn(async () => null as unknown) },
    $transaction: vi.fn((queries: Promise<unknown>[]) => Promise.all(queries)),
  };
  const coach = vi.fn(async () => ({ cue }));
  const service = new LearningService(
    db as unknown as PrismaService,
    { workflows: { coach } } as unknown as WorkflowRuntime,
  );
  return { service, db, row, coach };
}
const input = {
  requestId: '762c684a-d710-4462-9438-731b7ef93215',
  version: 0,
  answerText: '回答内容',
};

describe('独立学习', () => {
  it('在北京时间零点换日', () => {
    expect(learningDay(new Date('2026-11-16T15:59:59Z'))).toBe('2026-11-16');
    expect(learningDay(new Date('2026-11-16T16:00:00Z'))).toBe('2026-11-17');
  });
  it('同日已有题直接恢复，不重新选题', async () => {
    const { service, db } = fixture();
    expect((await service.daily()).completed).toBe(false);
    await service.daily();
    expect(db.dailyLearning.createMany).not.toHaveBeenCalled();
    expect(db.learningItem.createMany).not.toHaveBeenCalled();
  });
  it('没有历史记录时从题库建题，按用户与日期去重', async () => {
    const { service, db } = fixture();
    db.dailyLearning.findUnique.mockResolvedValueOnce(null!);
    db.learningItem.findFirst.mockResolvedValueOnce(null!);
    await service.daily();
    expect(db.learningItem.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
    expect(db.dailyLearning.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
  });
  it('优先选待练题，既有回答不算完成今日任务', async () => {
    const { service, db, row } = fixture();
    db.dailyLearning.findUnique.mockResolvedValueOnce(null!);
    row.attemptCount = 2;
    await service.daily();
    expect(db.learningItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userKey: 'local-user', reviewStatus: 'pending' } }),
    );
    expect(db.dailyLearning.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: [expect.objectContaining({ initialAttemptCount: 2 })] }),
    );
  });
  it('评分成功写入薄弱项且重试不重复评分', async () => {
    const { service, coach } = fixture();
    const first = await service.answer('item', input);
    expect(first.reviewStatus).toBe('pending');
    expect(first.version).toBe(1);
    expect((await service.answer('item', input)).attempts).toHaveLength(1);
    expect(coach).toHaveBeenCalledTimes(1);
    expect(coach).toHaveBeenCalledWith(
      expect.anything(),
      expect.not.objectContaining({ sessionId: expect.anything() }),
    );
  });
  it('同一请求修改回答、过期版本均拒绝', async () => {
    const { service } = fixture();
    await service.answer('item', input);
    await expect(service.answer('item', { ...input, answerText: '另一回答' })).rejects.toThrow(
      '不能修改',
    );
    await expect(service.answer('item', { ...input, requestId: 'another' })).rejects.toThrow(
      '新的作答',
    );
  });
  it('并发请求只允许一个模型调用', async () => {
    const { service, coach } = fixture();
    const result = await Promise.allSettled([
      service.answer('item', input),
      service.answer('item', input),
    ]);
    expect(result.filter((entry) => entry.status === 'fulfilled')).toHaveLength(1);
    expect(coach).toHaveBeenCalledTimes(1);
  });
  it('评分失败释放租约并保留版本，可以重试', async () => {
    const { service, coach, row } = fixture();
    coach.mockRejectedValueOnce(new Error('超时'));
    await expect(service.answer('item', input)).rejects.toThrow('超时');
    expect(row.leaseToken).toBeNull();
    expect(row.version).toBe(0);
    expect((await service.answer('item', input)).attempts).toHaveLength(1);
  });
  it('列表按用户、状态分页且不查询回答正文', async () => {
    const { service, db } = fixture();
    await service.list('pending', 2);
    expect(db.learningItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userKey: 'local-user', reviewStatus: 'pending' },
        skip: 20,
        take: 20,
      }),
    );
    expect(db.learningItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.not.objectContaining({ attempts: true }) }),
    );
  });
  it('导入查询限制用户与反馈可见性', async () => {
    const { service, db } = fixture();
    await expect(service.importQuestion('q')).rejects.toThrow('已评分');
    expect(db.interviewQuestion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'q',
          parentQuestionId: null,
          session: {
            plan: { profile: { userKey: 'local-user' } },
            OR: [{ feedbackPolicy: 'immediate' }, { status: 'completed' }],
          },
        },
      }),
    );
  });
  it('收藏独立于掌握状态，不覆盖作答', async () => {
    const { service, row } = fixture();
    await service.update('item', { bookmarked: true });
    await service.update('item', { reviewStatus: 'mastered' });
    expect(row.bookmarked).toBe(true);
    expect(row.reviewStatus).toBe('mastered');
    expect(row.version).toBe(0);
  });
});
