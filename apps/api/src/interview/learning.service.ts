import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { difficultyConstraints, snapshotFor, topics } from '@interview-assistant/agent-core';
import {
  learningItemSchema,
  learningListSchema,
  learningSummarySchema,
  questionSchema,
  rubricSnapshotSchema,
  type LearningFilter,
} from '@interview-assistant/contracts';
import { Prisma, type LearningItem } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { WorkflowRuntime } from '../agents/workflow-runtime.service.js';
import { toCue } from './cue-record.js';

const userKey = 'local-user';
export function learningDay(now = new Date()) {
  return new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
}
function view(item: LearningItem) {
  return learningItemSchema.parse({
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  });
}
const summarySelect = {
  id: true,
  question: true,
  language: true,
  bookmarked: true,
  reviewStatus: true,
  version: true,
  attemptCount: true,
  firstScore: true,
  latestScore: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class LearningService {
  constructor(
    private readonly db: PrismaService,
    private readonly runtime: WorkflowRuntime,
  ) {}

  async get(id: string) {
    const item = await this.db.learningItem.findFirst({ where: { id, userKey } });
    if (!item) throw new NotFoundException('练习不存在');
    return view(item);
  }

  async list(filter: LearningFilter, page: number) {
    const where: Prisma.LearningItemWhereInput = {
      userKey,
      ...(filter === 'bookmarked' ? { bookmarked: true } : {}),
      ...(filter === 'pending' || filter === 'mastered' ? { reviewStatus: filter } : {}),
      ...(filter === 'progress' ? { attemptCount: { gte: 1 } } : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.learningItem.findMany({
        where,
        select: summarySelect,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 20,
        skip: (page - 1) * 20,
      }),
      this.db.learningItem.count({ where }),
    ]);
    return learningListSchema.parse({
      items: items.map((item) =>
        learningSummarySchema.parse({
          ...item,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
        }),
      ),
      total,
      page,
      pageSize: 20,
    });
  }

  async daily() {
    const day = learningDay();
    const where = { userKey_day: { userKey, day } };
    let daily = await this.db.dailyLearning.findUnique({ where });
    if (!daily) {
      let item = await this.db.learningItem.findFirst({
        where: { userKey, reviewStatus: 'pending' },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      });
      if (!item) {
        const topic = topics[Math.floor(Date.parse(day) / 86400_000) % topics.length]!;
        const snapshot = snapshotFor(topic, 'l2');
        const sourceKey = `bank:${topic.id}:${snapshot.questionVersion}:${snapshot.rubricVersion}:zh-CN`;
        const unique = { userKey_sourceKey: { userKey, sourceKey } };
        await this.db.learningItem.createMany({
          data: [
            {
              userKey,
              sourceKey,
              question: {
                id: topic.id,
                competency: topic.competency,
                difficulty: 'l2',
                isCore: true,
                prompt: `${topic.prompt} ${difficultyConstraints.l2.zh}`,
                rubricSnapshot: snapshot,
              },
            },
          ],
          skipDuplicates: true,
        });
        item = await this.db.learningItem.findUniqueOrThrow({ where: unique });
      }
      await this.db.dailyLearning.createMany({
        data: [{ userKey, day, itemId: item.id, initialAttemptCount: item.attemptCount }],
        skipDuplicates: true,
      });
      daily = await this.db.dailyLearning.findUniqueOrThrow({ where });
    }
    const item = await this.get(daily.itemId);
    return { day, item, completed: item.attempts.length > daily.initialAttemptCount };
  }

  async importQuestion(id: string) {
    const source = await this.db.interviewQuestion.findFirst({
      where: {
        id,
        parentQuestionId: null,
        session: {
          plan: { profile: { userKey } },
          OR: [{ feedbackPolicy: 'immediate' }, { status: 'completed' }],
        },
      },
      include: { answer: { include: { cue: true } }, session: { include: { plan: true } } },
    });
    if (!source?.answer?.cue) throw new NotFoundException('暂无可收藏的已评分主问题');
    const snapshot = rubricSnapshotSchema.safeParse(source.rubricSnapshot);
    const cue = toCue(source.answer.cue);
    if (!snapshot.success || !cue.rubricEvaluation)
      throw new BadRequestException('此历史题目没有逐项评分，暂不支持重答对比');
    const sourceKey = `session:${id}`;
    const question = questionSchema.parse(source);
    await this.db.learningItem.createMany({
      data: [
        {
          userKey,
          sourceKey,
          question,
          language: source.session.plan.language,
          bookmarked: true,
          reviewStatus: cue.rubricEvaluation.items.some((item) => item.status !== 'met')
            ? 'pending'
            : 'none',
          attempts: [
            {
              requestId: `import:${id}`,
              createdAt: source.answer.createdAt.toISOString(),
              answerText: source.answer.answerText,
              cue,
            },
          ],
          attemptCount: 1,
          firstScore: cue.score,
          latestScore: cue.score,
        },
      ],
      skipDuplicates: true,
    });
    const item = await this.db.learningItem.update({
      where: { userKey_sourceKey: { userKey, sourceKey } },
      data: { bookmarked: true },
    });
    return view(item);
  }

  async update(
    id: string,
    data: { bookmarked?: boolean; reviewStatus?: 'none' | 'pending' | 'mastered' },
  ) {
    const result = await this.db.learningItem.updateMany({ where: { id, userKey }, data });
    if (!result.count) throw new NotFoundException('练习不存在');
    return this.get(id);
  }

  async answer(id: string, input: { requestId: string; version: number; answerText: string }) {
    const item = await this.get(id);
    const existing = item.attempts.find((attempt) => attempt.requestId === input.requestId);
    if (existing) {
      if (existing.answerText !== input.answerText)
        throw new ConflictException('同一提交编号不能修改回答');
      return item;
    }
    if (item.version !== input.version) throw new ConflictException('已有新的作答，请同步后重试');
    const token = randomUUID();
    const lock = await this.db.learningItem.updateMany({
      where: {
        id,
        userKey,
        version: input.version,
        OR: [{ leaseToken: null }, { leaseUntil: { lt: new Date() } }],
      },
      data: { leaseToken: token, leaseUntil: new Date(Date.now() + 300_000) },
    });
    if (!lock.count) throw new ConflictException('正在评分或进度已更新，请稍后同步');
    try {
      const digest = createHash('sha256').update(input.answerText).digest('hex');
      const { cue } = await this.runtime.workflows.coach(
        {
          sessionId: `learning:${id}`,
          language: item.language,
          currentQuestion: item.question,
          answerText: input.answerText,
          profileSummary: '',
          jobSummary: '',
          priorCues: [],
          allowFollowUp: false,
        },
        { operationId: `learning:${id}:${input.version}:${input.requestId}:${digest}` },
      );
      if (!cue.rubricEvaluation) throw new BadRequestException('未返回逐项评分，请重试');
      const attempts = [
        ...item.attempts,
        {
          requestId: input.requestId,
          createdAt: new Date().toISOString(),
          answerText: input.answerText,
          cue,
        },
      ];
      const saved = await this.db.learningItem.updateMany({
        where: { id, userKey, version: input.version, leaseToken: token },
        data: {
          attempts,
          version: { increment: 1 },
          attemptCount: attempts.length,
          firstScore: attempts[0]!.cue.score,
          latestScore: cue.score,
          ...(cue.rubricEvaluation.items.some((entry) => entry.status !== 'met')
            ? { reviewStatus: 'pending' }
            : {}),
          leaseToken: null,
          leaseUntil: null,
        },
      });
      if (!saved.count) throw new ConflictException('进度已更新，请同步后查看');
    } finally {
      try {
        await this.db.learningItem.updateMany({
          where: { id, userKey, leaseToken: token },
          data: { leaseToken: null, leaseUntil: null },
        });
      } catch {
        console.warn('[learning] lease cleanup failed; expiry will release it');
      }
    }
    return this.get(id);
  }
}
