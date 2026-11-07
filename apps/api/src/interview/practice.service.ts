import { randomUUID, createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { practicePrompts } from '@interview-assistant/agent-core';
import {
  interviewLanguageSchema,
  practiceAttemptSchema,
  practiceTaskSchema,
  questionSchema,
  rubricSnapshotSchema,
} from '@interview-assistant/contracts';
import { z } from 'zod';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { WorkflowRuntime } from '../agents/workflow-runtime.service.js';
import { toCue } from './cue-record.js';

const sourceInclude = {
  answer: { include: { cue: true } },
  session: { include: { plan: true } },
} as const;

@Injectable()
export class PracticeService {
  constructor(
    private readonly db: PrismaService,
    private readonly runtime: WorkflowRuntime,
  ) {}

  async start(sourceQuestionId: string, criterionId: string) {
    const source = await this.db.interviewQuestion.findFirst({
      where: {
        id: sourceQuestionId,
        parentQuestionId: null,
        session: { status: 'completed', plan: { profile: { userKey: 'local-user' } } },
      },
      include: sourceInclude,
    });
    if (!source?.answer?.cue) throw new NotFoundException('未找到已完成的评分');
    const snapshot = rubricSnapshotSchema.safeParse(source.rubricSnapshot);
    const item = toCue(source.answer.cue).rubricEvaluation?.items.find(
      (i) => i.criterionId === criterionId,
    );
    if (
      !snapshot.success ||
      !item ||
      item.status === 'met' ||
      snapshot.data.questionVersion !== '1.0:' + source.difficulty
    )
      throw new BadRequestException('此评分项没有可用的专项练习');
    const key = { sourceQuestionId, criterionId };
    const where = { sourceQuestionId_criterionId: key };
    const existing = await this.db.practiceTask.findUnique({ where });
    if (existing) return this.view(existing.id);
    const questions = practicePrompts(
      questionSchema.parse(source),
      interviewLanguageSchema.parse(source.session.plan.language),
    );
    const criterion = snapshot.data.criteria.find((c) => c.id === criterionId);
    if (!criterion) throw new BadRequestException('题目快照缺少评分项');
    questions[1] +=
      ' ' +
      (source.session.plan.language === 'en-US' ? 'Focus criterion: ' : '本次练习重点：') +
      criterion.description;
    const data = { ...key, questions };
    await this.db.practiceTask.createMany({ data: [data], skipDuplicates: true });
    const task = await this.db.practiceTask.findUniqueOrThrow({ where });
    return this.view(task.id);
  }

  private async load(id: string) {
    const task = await this.db.practiceTask.findFirst({
      where: { id, source: { session: { plan: { profile: { userKey: 'local-user' } } } } },
      include: { source: { include: sourceInclude } },
    });
    if (!task || !task.source.answer?.cue) throw new NotFoundException('练习不存在');
    return {
      task,
      questions: z.array(z.string()).length(3).parse(task.questions),
      attempts: practiceAttemptSchema.array().parse(task.attempts),
      original: {
        prompt: task.source.prompt,
        answerText: task.source.answer.answerText,
        cue: toCue(task.source.answer.cue),
      },
    };
  }
  async view(id: string) {
    const { task, questions, attempts, original } = await this.load(id);
    return practiceTaskSchema.parse({
      id,
      sourceQuestionId: task.sourceQuestionId,
      criterionId: task.criterionId,
      snapshot: task.source.rubricSnapshot,
      original,
      attempts,
      stage: task.stage,
      prompt: questions[task.stage] ?? null,
      freshRetest: !!task.freshKey,
    });
  }
  async answer(id: string, stage: number, answerText: string) {
    const { task, questions, attempts } = await this.load(id);
    if (stage < task.stage && attempts[stage]?.answerText === answerText) return this.view(id);
    if (stage !== task.stage || !questions[stage])
      throw new ConflictException('练习进度已更新，请刷新');
    const token = randomUUID();
    const lease = await this.db.practiceTask.updateMany({
      where: { id, stage, OR: [{ leaseToken: null }, { leaseUntil: { lt: new Date() } }] },
      data: { leaseToken: token, leaseUntil: new Date(Date.now() + 300_000) },
    });
    if (!lease.count) throw new ConflictException('此回答正在处理，请稍后重试');
    try {
      const session = task.source.session;
      const prompt = questions[stage]!;
      const digest = createHash('sha256').update(answerText).digest('hex');
      const { cue } = await this.runtime.workflows.coach(
        {
          sessionId: session.id,
          language: session.plan.language,
          currentQuestion: questionSchema.parse({ ...task.source, prompt }),
          answerText,
          profileSummary: '',
          jobSummary: '',
          priorCues: [],
          allowFollowUp: false,
        },
        { sessionId: session.id, operationId: `practice:${id}:${stage}:${digest}` },
      );
      const where = { id, stage, leaseToken: token };
      const data = {
        stage: { increment: 1 },
        attempts: [...attempts, { prompt, answerText, cue }],
        leaseToken: null,
        leaseUntil: null,
      };
      // Reserve the retest when it first becomes visible. A later task labels it as review.
      const freshKey =
        stage === 1
          ? 'local-user:case-v1:' + rubricSnapshotSchema.parse(task.source.rubricSnapshot).bankId
          : null;
      let saved;
      try {
        saved = await this.db.practiceTask.updateMany({
          where,
          data: { ...data, ...(freshKey ? { freshKey } : {}) },
        });
      } catch (e) {
        if (!(freshKey && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'))
          throw e;
        saved = await this.db.practiceTask.updateMany({ where, data });
      }
      if (!saved.count) throw new ConflictException('进度已更新，请刷新');
    } finally {
      await this.db.practiceTask.updateMany({
        where: { id, leaseToken: token },
        data: { leaseToken: null, leaseUntil: null },
      });
    }
    return this.view(id);
  }
  async markReferenceViewed(questionId: string) {
    await this.db.coachingCue.updateMany({
      where: {
        answer: { questionId },
        referenceViewedAt: null,
        session: {
          status: 'active',
          feedbackPolicy: 'immediate',
          plan: { profile: { userKey: 'local-user' } },
        },
      },
      data: { referenceViewedAt: new Date() },
    });
    return { recorded: true };
  }

  async dispute(questionId: string, reason: string) {
    const saved = await this.db.coachingCue.updateMany({
      where: {
        answer: { questionId },
        session: {
          plan: { profile: { userKey: 'local-user' } },
          OR: [{ feedbackPolicy: 'immediate' }, { status: 'completed' }],
        },
      },
      data: { dispute: reason },
    });
    if (!saved.count) throw new NotFoundException('暂无可复核的评分');
    return { saved: true };
  }
}
