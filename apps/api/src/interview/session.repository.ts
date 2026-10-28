import { ConflictException } from '@nestjs/common';
import type {
  CoachingCue,
  EvaluationReport,
  InterviewQuestion,
  InterviewSessionCreateInput,
} from '@interview-assistant/contracts';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';

export type TurnResponse = {
  cue: CoachingCue;
  nextQuestion: InterviewQuestion | null;
  model: string;
  degraded: boolean;
  currentQuestionIndex: number;
  activeQuestionId: string | null;
  status: string;
};
export type TurnCommit = {
  sessionId: string;
  questionId: string;
  answerText: string;
  requestHash: string;
  cue: CoachingCue;
  response: TurnResponse;
  expectedVersion: number;
  leaseToken: string;
};

export class SessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: InterviewSessionCreateInput, questions: InterviewQuestion[]) {
    return this.prisma.$transaction(async (tx) => {
      const plan = await tx.interviewPlan.create({
        data: {
          profileId: input.profileId,
          jobId: input.jobId,
          language: input.language,
          round: input.round,
          difficulty: input.difficulty,
          questionCount: input.questionCount,
        },
      });
      const session = await tx.interviewSession.create({
        data: { planId: plan.id, mode: 'simulation' },
      });
      const persisted = questions.map((question, order) => ({
        ...question,
        id: `${session.id}:${order}:${question.id || 'question'}`,
        parentQuestionId: null,
      }));
      await tx.interviewQuestion.createMany({
        data: persisted.map((q, order) => ({
          id: q.id,
          sessionId: session.id,
          order,
          competency: q.competency,
          difficulty: q.difficulty,
          prompt: q.prompt,
          isCore: q.isCore,
          parentQuestionId: null,
        })),
      });
      const activeQuestionId = persisted[0]?.id ?? null;
      await tx.interviewSession.update({ where: { id: session.id }, data: { activeQuestionId } });
      return {
        id: session.id,
        planId: plan.id,
        questions: persisted,
        activeQuestionId,
        currentQuestionIndex: 0,
        version: 0,
        status: 'active',
      };
    });
  }

  async claim(id: string, version: number, token: string, until: Date) {
    const now = new Date();
    const result = await this.prisma.interviewSession.updateMany({
      where: {
        id,
        version,
        status: { in: ['active', 'awaiting_finish'] },
        OR: [{ turnLeaseToken: null }, { turnLeaseUntil: { lt: now } }],
      },
      data: { turnLeaseToken: token, turnLeaseUntil: until },
    });
    return result.count === 1;
  }

  async renew(id: string, token: string, until: Date) {
    const result = await this.prisma.interviewSession.updateMany({
      where: { id, turnLeaseToken: token },
      data: { turnLeaseUntil: until },
    });
    return result.count === 1;
  }

  release(id: string, token: string) {
    return this.prisma.interviewSession.updateMany({
      where: { id, turnLeaseToken: token },
      data: { turnLeaseToken: null, turnLeaseUntil: null },
    });
  }

  async commit(input: TurnCommit): Promise<TurnResponse> {
    return this.prisma.$transaction(async (tx) => {
      const advanced = await tx.interviewSession.updateMany({
        where: {
          id: input.sessionId,
          version: input.expectedVersion,
          status: 'active',
          activeQuestionId: input.questionId,
          turnLeaseToken: input.leaseToken,
        },
        data: {
          version: { increment: 1 },
          activeQuestionId: input.response.activeQuestionId,
          currentQuestionIndex: input.response.currentQuestionIndex,
          status: input.response.status,
          turnLeaseToken: null,
          turnLeaseUntil: null,
        },
      });
      if (advanced.count !== 1)
        throw new ConflictException('Interview state changed; reload the current question');
      const next = input.response.nextQuestion;
      if (next?.parentQuestionId) {
        await tx.interviewQuestion.create({
          data: {
            id: next.id,
            sessionId: input.sessionId,
            order: 1000 + input.response.currentQuestionIndex,
            competency: next.competency,
            difficulty: next.difficulty,
            prompt: next.prompt,
            isCore: false,
            parentQuestionId: next.parentQuestionId,
          },
        });
      }
      const answer = await tx.interviewAnswer.create({
        data: {
          sessionId: input.sessionId,
          questionId: input.questionId,
          answerText: input.answerText,
          requestHash: input.requestHash,
          result: input.response as unknown as Prisma.InputJsonValue,
        },
      });
      await tx.coachingCue.create({
        data: {
          sessionId: input.sessionId,
          answerId: answer.id,
          competency: input.cue.competency,
          score: input.cue.score,
          strengths: input.cue.strengths,
          gaps: input.cue.gaps,
          nextAction: input.cue.nextAction,
          evidence: input.cue.evidence as Prisma.InputJsonValue,
          ...(input.cue.followUpQuestion ? { followUpQuestion: input.cue.followUpQuestion } : {}),
        },
      });
      return input.response;
    });
  }

  async finish(id: string, report: EvaluationReport, version: number, token: string) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.interviewSession.updateMany({
        where: {
          id,
          version,
          turnLeaseToken: token,
          status: { in: ['active', 'awaiting_finish'] },
        },
        data: {
          status: 'completed',
          endedAt: new Date(),
          activeQuestionId: null,
          version: { increment: 1 },
          turnLeaseToken: null,
          turnLeaseUntil: null,
        },
      });
      if (result.count !== 1)
        throw new ConflictException('Interview state changed; reload before finishing');
      const saved = await tx.evaluationReport.create({
        data: {
          sessionId: id,
          summary: report.summary,
          overallScore: report.overallScore,
          scoringVersion: report.scoringVersion ?? 'evidence-v2',
          competencyScores: report.competencyScores as Prisma.InputJsonValue,
          strengths: report.strengths,
          gaps: report.gaps,
          nextPlan: report.nextPlan as Prisma.InputJsonValue,
        },
      });
      return {
        ...saved,
        cues: report.cues,
        supplementalCues: report.supplementalCues ?? [],
        assessmentStatus: report.assessmentStatus,
      };
    });
  }
}
