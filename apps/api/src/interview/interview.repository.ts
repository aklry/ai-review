import type {
  CoachingCue,
  EvaluationReport,
  InterviewQuestion,
  InterviewSessionCreateInput,
  JobAnalysis,
  JobAnalyzeInput,
  ProfileInput,
  StoryInput,
} from '@interview-assistant/contracts';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaClient } from '../generated/prisma/client.js';

export type InterviewSessionRecord = {
  id: string;
  status: string;
  currentQuestionIndex: number;
  plan: {
    language: string;
    profile: { resumeText: string };
    job: {
      targetRole: string;
      company: string | null;
      description: string;
      analysis: unknown;
    };
  };
  questions: Array<InterviewQuestion>;
  cues: Array<Record<string, unknown>>;
  report: Record<string, unknown> | null;
};

export type JobRecord = {
  id: string;
  profileId: string;
  targetRole: string;
  company: string | null;
  description: string;
  analysis: JobAnalysis | null;
  analysisStatus: 'pending' | 'processing' | 'completed' | 'failed';
  analysisError: string | null;
};

export class InterviewRepository {
  constructor(private readonly prisma: PrismaClient) {}

  createProfile(input: ProfileInput) {
    return this.prisma.candidateProfile.create({
      data: {
        userKey: 'local-user',
        resumeText: input.resumeText,
        ...(input.displayName ? { displayName: input.displayName } : {}),
      },
    });
  }

  createJob(input: JobAnalyzeInput, analysis: JobAnalysis) {
    return this.prisma.job.create({
      data: {
        profileId: input.profileId,
        targetRole: input.targetRole,
        description: input.jobDescription,
        analysis: analysis as Prisma.InputJsonValue,
        analysisStatus: 'completed',
        analysisError: null,
        ...(input.company ? { company: input.company } : {}),
      },
    });
  }

  createProcessingJob(input: JobAnalyzeInput) {
    return this.prisma.job.create({
      data: {
        profileId: input.profileId,
        targetRole: input.targetRole,
        description: input.jobDescription,
        analysis: Prisma.DbNull,
        analysisStatus: 'processing',
        analysisError: null,
        ...(input.company ? { company: input.company } : {}),
      },
    });
  }

  updateJobAnalysis(jobId: string, analysis: JobAnalysis) {
    return this.prisma.job.update({
      where: { id: jobId },
      data: {
        analysis: analysis as Prisma.InputJsonValue,
        analysisStatus: 'completed',
        analysisError: null,
      },
    });
  }

  markJobAnalysisFailed(jobId: string, errorMessage: string) {
    return this.prisma.job.update({
      where: { id: jobId },
      data: {
        analysisStatus: 'failed',
        analysisError: errorMessage,
      },
    });
  }

  findJobByInput(input: JobAnalyzeInput) {
    return this.prisma.job.findFirst({
      where: {
        profileId: input.profileId,
        targetRole: input.targetRole,
        company: input.company ?? null,
        description: input.jobDescription,
      },
    });
  }

  createStory(profileId: string, input: StoryInput) {
    return this.prisma.story.create({
      data: {
        profileId,
        title: input.title,
        project: input.project,
        situation: input.situation,
        task: input.task,
        action: input.action,
        result: input.result,
        metrics: input.metrics,
      },
    });
  }

  async createSession(
    input: InterviewSessionCreateInput,
    questions: InterviewQuestion[],
  ): Promise<{ id: string; planId: string; questions: InterviewQuestion[] }> {
    const plan = await this.prisma.interviewPlan.create({
      data: {
        profileId: input.profileId,
        jobId: input.jobId,
        language: input.language,
        round: input.round,
        difficulty: input.difficulty,
        questionCount: input.questionCount,
      },
    });
    const session = await this.prisma.interviewSession.create({
      data: {
        planId: plan.id,
        mode: 'simulation',
      },
    });
    await this.prisma.interviewQuestion.createMany({
      data: questions.map((question, order) => ({
        sessionId: session.id,
        order,
        id: question.id,
        competency: question.competency,
        difficulty: question.difficulty,
        prompt: question.prompt,
        isCore: question.isCore,
      })),
    });

    return { id: session.id, planId: plan.id, questions };
  }

  async saveAnswerFeedback(input: {
    sessionId: string;
    questionId: string;
    answerText: string;
    cue: CoachingCue;
  }): Promise<{ answerId: string; cueId: string }> {
    const answer = await this.prisma.interviewAnswer.upsert({
      where: { questionId: input.questionId },
      create: {
        sessionId: input.sessionId,
        questionId: input.questionId,
        answerText: input.answerText,
      },
      update: {
        answerText: input.answerText,
      },
    });
    const cue = await this.prisma.coachingCue.upsert({
      where: { answerId: answer.id },
      create: {
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
      update: {
        competency: input.cue.competency,
        score: input.cue.score,
        strengths: input.cue.strengths,
        gaps: input.cue.gaps,
        nextAction: input.cue.nextAction,
        evidence: input.cue.evidence as Prisma.InputJsonValue,
        followUpQuestion: input.cue.followUpQuestion ?? null,
      },
    });
    await this.prisma.interviewSession.update({
      where: { id: input.sessionId },
      data: { currentQuestionIndex: { increment: 1 } },
    });

    return { answerId: answer.id, cueId: cue.id };
  }

  createFollowUpQuestion(sessionId: string, question: InterviewQuestion, order: number) {
    return this.prisma.interviewQuestion.create({
      data: {
        sessionId,
        order,
        id: question.id,
        competency: question.competency,
        difficulty: question.difficulty,
        prompt: question.prompt,
        isCore: question.isCore,
      },
    });
  }

  async finishSession(sessionId: string, report: EvaluationReport) {
    await this.prisma.interviewSession.update({
      where: { id: sessionId },
      data: {
        status: 'completed',
        endedAt: new Date(),
      },
    });
    return this.prisma.evaluationReport.upsert({
      where: { sessionId },
      create: {
        sessionId,
        summary: report.summary,
        overallScore: report.overallScore,
        competencyScores: report.competencyScores as Prisma.InputJsonValue,
        strengths: report.strengths,
        gaps: report.gaps,
        nextPlan: report.nextPlan as Prisma.InputJsonValue,
      },
      update: {
        summary: report.summary,
        overallScore: report.overallScore,
        competencyScores: report.competencyScores as Prisma.InputJsonValue,
        strengths: report.strengths,
        gaps: report.gaps,
        nextPlan: report.nextPlan as Prisma.InputJsonValue,
      },
    });
  }

  getProfile(profileId: string) {
    return this.prisma.candidateProfile.findUniqueOrThrow({
      where: { id: profileId },
      include: { stories: true },
    });
  }

  getJob(jobId: string) {
    return this.prisma.job.findUniqueOrThrow({
      where: { id: jobId },
      include: { profile: true },
    });
  }

  async getSession(sessionId: string): Promise<InterviewSessionRecord> {
    const session = await this.prisma.interviewSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: {
        plan: { include: { profile: true, job: true } },
        questions: {
          orderBy: { order: 'asc' },
          include: { answer: { include: { cue: true } } },
        },
        cues: true,
        report: true,
      },
    });
    return session as unknown as InterviewSessionRecord;
  }

  getReport(sessionId: string) {
    return this.prisma.evaluationReport.findUniqueOrThrow({
      where: { sessionId },
    });
  }

  recordUsage(input: {
    userKey: string;
    sessionId?: string;
    model: string;
    taskType: string;
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    degraded: boolean;
    estimatedCostCny: number;
  }) {
    return this.prisma.usageLedger.create({
      data: {
        userKey: input.userKey,
        model: input.model,
        taskType: input.taskType,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        cachedInputTokens: input.cachedInputTokens,
        degraded: input.degraded,
        estimatedCostCny: input.estimatedCostCny,
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      },
    });
  }
}
