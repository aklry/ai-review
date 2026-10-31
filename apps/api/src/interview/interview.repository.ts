import type {
  EvaluationReport,
  InterviewQuestion,
  InterviewSessionCreateInput,
  JobAnalysis,
  JobAnalyzeInput,
  ProfileInput,
  StoryInput,
  SessionHistoryQuery,
} from '@interview-assistant/contracts';
import { Prisma } from '../generated/prisma/client.js';
import type { PrismaClient } from '../generated/prisma/client.js';
import { SessionRepository, type TurnCommit } from './session.repository.js';
import { toCue } from './cue-record.js';
import { SessionHistoryRepository } from './session-history.repository.js';

export type InterviewSessionRecord = {
  id: string;
  status: string;
  currentQuestionIndex: number;
  activeQuestionId: string | null;
  version: number;
  plan: {
    profileId: string;
    jobId: string;
    language: string;
    profile: { resumeText: string };
    job: {
      targetRole: string;
      company: string | null;
      description: string;
      analysis: unknown;
    };
  };
  questions: Array<
    InterviewQuestion & {
      answer?: {
        answerText: string;
        requestHash: string | null;
        result: unknown;
        cue: Record<string, unknown> | null;
      } | null;
    }
  >;
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
  private readonly sessions: SessionRepository;
  constructor(private readonly prisma: PrismaClient) {
    this.sessions = new SessionRepository(prisma);
  }

  listSessions(query: SessionHistoryQuery) {
    return new SessionHistoryRepository(this.prisma).list(query);
  }
  getSessionReview(id: string) {
    return new SessionHistoryRepository(this.prisma).review(id);
  }

  createWorkflowSession(input: InterviewSessionCreateInput, questions: InterviewQuestion[]) {
    return this.sessions.create(input, questions);
  }
  claimSession(id: string, version: number, token: string, until: Date) {
    return this.sessions.claim(id, version, token, until);
  }
  renewSession(id: string, token: string, until: Date) {
    return this.sessions.renew(id, token, until);
  }
  releaseSession(id: string, token: string) {
    return this.sessions.release(id, token);
  }
  commitTurn(input: TurnCommit) {
    return this.sessions.commit(input);
  }
  finishWorkflowSession(id: string, report: EvaluationReport, version: number, token: string) {
    return this.sessions.finish(id, report, version, token);
  }

  saveStructuredProfile(id: string, hash: string, profile: unknown) {
    return this.prisma.candidateProfile.update({
      where: { id },
      data: { structuredResume: profile as Prisma.InputJsonValue, structuredResumeHash: hash },
    });
  }

  async claimJob(id: string, owner: string, until: Date) {
    const result = await this.prisma.job.updateMany({
      where: {
        id,
        analysisStatus: 'processing',
        analysisAttempts: { lt: 3 },
        OR: [{ analysisLeaseOwner: null }, { analysisLeaseUntil: { lt: new Date() } }],
      },
      data: {
        analysisLeaseOwner: owner,
        analysisLeaseUntil: until,
        analysisAttempts: { increment: 1 },
      },
    });
    return result.count === 1;
  }
  renewJob(id: string, owner: string, until: Date) {
    return this.prisma.job.updateMany({
      where: { id, analysisLeaseOwner: owner },
      data: { analysisLeaseUntil: until },
    });
  }
  async completeJob(id: string, owner: string, analysis: JobAnalysis) {
    const result = await this.prisma.job.updateMany({
      where: { id, analysisLeaseOwner: owner },
      data: {
        analysis: analysis as Prisma.InputJsonValue,
        analysisStatus: 'completed',
        analysisError: null,
        analysisLeaseOwner: null,
        analysisLeaseUntil: null,
      },
    });
    if (result.count !== 1) throw new Error('Job analysis lease was lost');
  }
  failJob(id: string, owner: string, message: string) {
    return this.prisma.job.updateMany({
      where: { id, analysisLeaseOwner: owner },
      data: {
        analysisStatus: 'failed',
        analysisError: message.slice(0, 500),
        analysisLeaseOwner: null,
        analysisLeaseUntil: null,
      },
    });
  }
  async recoverableJobs() {
    await this.prisma.job.updateMany({
      where: {
        analysisStatus: 'processing',
        analysisAttempts: { gte: 3 },
        OR: [{ analysisLeaseUntil: null }, { analysisLeaseUntil: { lt: new Date() } }],
      },
      data: {
        analysisStatus: 'failed',
        analysisError: 'Analysis interrupted repeatedly; please retry',
        analysisLeaseOwner: null,
        analysisLeaseUntil: null,
      },
    });
    return this.prisma.job.findMany({
      where: {
        analysisStatus: 'processing',
        analysisAttempts: { lt: 3 },
        OR: [{ analysisLeaseUntil: null }, { analysisLeaseUntil: { lt: new Date() } }],
      },
      take: 5,
      orderBy: { createdAt: 'asc' },
    });
  }

  findJobByHash(inputHash: string) {
    return this.prisma.job.findUnique({ where: { inputHash } });
  }
  async createWorkflowJob(input: JobAnalyzeInput, inputHash: string) {
    return this.prisma.job.upsert({
      where: { inputHash },
      update: {},
      create: {
        profileId: input.profileId,
        targetRole: input.targetRole,
        company: input.company ?? null,
        description: input.jobDescription,
        inputHash,
        analysisStatus: 'processing',
      },
    });
  }

  createProfile(input: ProfileInput) {
    return this.prisma.candidateProfile.create({
      data: {
        userKey: 'local-user',
        resumeText: input.resumeText,
        ...(input.displayName ? { displayName: input.displayName } : {}),
      },
    });
  }

  async retryFailedJob(jobId: string): Promise<boolean> {
    const result = await this.prisma.job.updateMany({
      where: { id: jobId, analysisStatus: 'failed' },
      data: {
        analysis: Prisma.DbNull,
        analysisStatus: 'processing',
        analysisError: null,
        analysisLeaseOwner: null,
        analysisLeaseUntil: null,
        analysisAttempts: 0,
      },
    });
    return result.count === 1;
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
        cues: { orderBy: { createdAt: 'asc' } },
        report: true,
      },
    });
    return session as unknown as InterviewSessionRecord;
  }

  async getReport(sessionId: string) {
    const report = await this.prisma.evaluationReport.findUniqueOrThrow({
      where: { sessionId },
      include: {
        session: {
          include: {
            questions: {
              include: { answer: { include: { cue: true } } },
            },
          },
        },
      },
    });
    const { session, ...data } = report;
    const scores = report.competencyScores as Record<string, number | null>;
    const measured = Object.values(scores).filter((value) => value !== null).length;
    return {
      ...data,
      cues: session.questions.flatMap((q) =>
        !q.parentQuestionId && q.answer?.cue ? [toCue(q.answer.cue)] : [],
      ),
      supplementalCues: session.questions.flatMap((q) =>
        q.parentQuestionId && q.answer?.cue ? [toCue(q.answer.cue)] : [],
      ),
      assessmentStatus: measured === 4 ? 'complete' : measured === 0 ? 'unassessed' : 'partial',
    };
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
    operationId?: string;
    promptVersion?: string;
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
        ...(input.operationId ? { operationId: input.operationId } : {}),
        ...(input.promptVersion ? { promptVersion: input.promptVersion } : {}),
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      },
    });
  }
}
