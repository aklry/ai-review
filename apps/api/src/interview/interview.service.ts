import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import {
  answerSubmitInputSchema,
  jobAnalyzeInputSchema,
  profileInputSchema,
  storyInputSchema,
  structuredProfileSchema,
  type AnswerSubmitInput,
  type InterviewSessionCreateInput,
  type JobAnalyzeInput,
  type ProfileInput,
  type StoryInput,
} from '@interview-assistant/contracts';
import { WorkflowRuntime } from '../agents/workflow-runtime.service.js';
import { InterviewRepository, type InterviewSessionRecord } from './interview.repository.js';
import { planNextTurn } from './session-state.js';
import type { TurnResponse } from './session.repository.js';
import { toCue } from './cue-record.js';

const LEASE_MS = 300_000;

@Injectable()
export class InterviewService implements OnApplicationBootstrap, OnModuleDestroy {
  private recoveryTimer: ReturnType<typeof setInterval> | undefined;
  private recovering = false;
  private stopped = false;
  private readonly jobs = new Map<string, Promise<void>>();
  constructor(
    private readonly repository: InterviewRepository,
    private readonly runtime: WorkflowRuntime,
  ) {}

  onApplicationBootstrap() {
    this.recoveryTimer = setInterval(() => {
      void this.recover().catch(() =>
        console.error('[job-analysis] recovery failed; check database connectivity'),
      );
    }, 5000);
    this.recoveryTimer.unref();
    void this.recover().catch(() =>
      console.error('[job-analysis] initial recovery failed; check database connectivity'),
    );
  }
  async onModuleDestroy() {
    this.stopped = true;
    if (this.recoveryTimer) clearInterval(this.recoveryTimer);
    await Promise.allSettled(this.jobs.values());
  }
  createProfile(input: ProfileInput) {
    return this.repository.createProfile(profileInputSchema.parse(input));
  }
  createStory(profileId: string, input: StoryInput) {
    return this.repository.createStory(profileId, storyInputSchema.parse(input));
  }
  getJob(id: string) {
    return this.repository.getJob(id);
  }
  getSession(id: string) {
    return this.repository.getSession(id);
  }
  getReport(id: string) {
    return this.repository.getReport(id);
  }

  async analyzeJob(input: JobAnalyzeInput) {
    const valid = jobAnalyzeInputSchema.parse(input);
    const profile = await this.repository.getProfile(valid.profileId);
    const stories = profile.stories.map((story) => storyInputSchema.parse(story));
    const inputHash = jobHash(valid, profile.resumeText, stories);
    let job = await this.repository.findJobByHash(inputHash);
    if (!job) job = await this.repository.createWorkflowJob(valid, inputHash);
    if (job.analysisStatus === 'failed') {
      if (!(await this.repository.retryFailedJob(job.id))) return this.repository.getJob(job.id);
      job = { ...job, analysisStatus: 'processing', analysisError: null };
    }
    if (job.analysisStatus === 'processing') this.schedule(job.id);
    return job;
  }

  async createSession(input: InterviewSessionCreateInput) {
    const profile = await this.repository.getProfile(input.profileId);
    const job = await this.repository.getJob(input.jobId);
    if (job.profileId !== profile.id)
      throw new BadRequestException('Job does not belong to this profile');
    if (job.analysisStatus !== 'completed' || !job.analysis)
      throw new BadRequestException('Job analysis is not ready yet');
    const questions = await this.runtime.workflows.questions(
      {
        targetRole: job.targetRole,
        ...(job.company ? { company: job.company } : {}),
        language: input.language,
        round: input.round,
        difficulty: input.difficulty,
        questionCount: input.questionCount ?? 8,
        jobAnalysis: job.analysis,
        profileSummary: profile.resumeText,
        stories: profile.stories.map((story) => storyInputSchema.parse(story)),
      },
      { operationId: randomUUID() },
    );
    const created = await this.repository.createWorkflowSession(input, questions);
    return this.repository.getSession(created.id);
  }

  async submitAnswer(sessionId: string, input: AnswerSubmitInput): Promise<TurnResponse> {
    const valid = answerSubmitInputSchema.parse(input);
    const session = await this.repository.getSession(sessionId);
    const question = session.questions.find((q) => q.id === valid.questionId);
    if (!question) throw new NotFoundException('Question not found in this session');
    const requestHash = hash(valid.answerText);
    if (question.answer) {
      if (question.answer.requestHash === requestHash && question.answer.result)
        return question.answer.result as TurnResponse;
      throw new ConflictException('This answer is already submitted; reload the session');
    }
    if (session.status !== 'active' || session.activeQuestionId !== question.id)
      throw new ConflictException('This is not the active question');
    return this.withLease(session, async (token) => {
      const result = await this.runtime.workflows.coach(
        {
          sessionId,
          language: session.plan.language,
          currentQuestion: question,
          answerText: valid.answerText,
          profileSummary: session.plan.profile.resumeText,
          jobSummary: session.plan.job.description,
          priorCues: session.cues.map(toCue),
        },
        { operationId: `${sessionId}:${question.id}:${requestHash}`, sessionId },
      );
      const cue = { ...result.cue };
      delete cue.followUpQuestion;
      if (result.followUp) cue.followUpQuestion = result.followUp.prompt;
      const next = planNextTurn(session.questions, question, result.followUp);
      const response: TurnResponse = {
        cue,
        nextQuestion: next.nextQuestion,
        currentQuestionIndex: next.currentQuestionIndex,
        status: next.status,
        activeQuestionId: next.nextQuestion?.id ?? null,
        model: result.model,
        degraded: result.degraded,
      };
      return this.repository.commitTurn({
        sessionId,
        questionId: question.id,
        answerText: valid.answerText,
        requestHash,
        cue,
        response,
        expectedVersion: session.version,
        leaseToken: token,
      });
    });
  }

  async finishSession(sessionId: string) {
    const session = await this.repository.getSession(sessionId);
    if (session.report || session.status === 'completed')
      return this.repository.getReport(sessionId);
    if (!['active', 'awaiting_finish'].includes(session.status))
      throw new ConflictException('Interview cannot be finished in this state');
    const cues = session.questions
      .filter((q) => !q.parentQuestionId && q.answer?.cue)
      .map((q) => toCue(q.answer!.cue!));
    const supplementalCues = session.questions
      .filter((q) => q.parentQuestionId && q.answer?.cue)
      .map((q) => toCue(q.answer!.cue!));
    if (cues.length === 0)
      throw new BadRequestException('Answer at least one question before generating a report');
    return this.withLease(session, async (token) => {
      const report = await this.runtime.workflows.report(
        {
          sessionId,
          language: session.plan.language,
          profileSummary: session.plan.profile.resumeText,
          jobSummary: session.plan.job.description,
          cues,
          supplementalCues,
        },
        { operationId: `${sessionId}:${session.version}:evidence-v2`, sessionId },
      );
      return this.repository.finishWorkflowSession(sessionId, report, session.version, token);
    });
  }

  private async withLease<T>(
    session: InterviewSessionRecord,
    run: (token: string) => Promise<T>,
  ): Promise<T> {
    const token = randomUUID();
    if (
      !(await this.repository.claimSession(
        session.id,
        session.version,
        token,
        new Date(Date.now() + LEASE_MS),
      ))
    )
      throw new ConflictException('An interview operation is already running; reload its state');
    const heartbeat = setInterval(() => {
      void this.repository
        .renewSession(session.id, token, new Date(Date.now() + LEASE_MS))
        .catch(() => undefined);
    }, 30_000);
    heartbeat.unref();
    try {
      return await run(token);
    } finally {
      clearInterval(heartbeat);
      await this.repository
        .releaseSession(session.id, token)
        .catch(() => console.error('[interview] lease cleanup failed; expiry will release it'));
    }
  }

  private schedule(id: string) {
    if (this.stopped || this.jobs.has(id)) return;
    const promise = this.runAnalysis(id)
      .catch(() => console.error(`[job-analysis] job ${id} failed; status persisted`))
      .finally(() => this.jobs.delete(id));
    this.jobs.set(id, promise);
  }
  private async recover() {
    if (this.stopped || this.recovering) return;
    this.recovering = true;
    try {
      for (const job of await this.repository.recoverableJobs()) this.schedule(job.id);
    } finally {
      this.recovering = false;
    }
  }
  private async runAnalysis(id: string) {
    const owner = randomUUID();
    if (!(await this.repository.claimJob(id, owner, new Date(Date.now() + LEASE_MS)))) return;
    const heartbeat = setInterval(() => {
      void this.repository
        .renewJob(id, owner, new Date(Date.now() + LEASE_MS))
        .catch(() => undefined);
    }, 30_000);
    heartbeat.unref();
    try {
      const job = await this.repository.getJob(id);
      const profile = await this.repository.getProfile(job.profileId);
      const stories = profile.stories.map((story) => storyInputSchema.parse(story));
      const input: JobAnalyzeInput = {
        profileId: profile.id,
        targetRole: job.targetRole,
        ...(job.company ? { company: job.company } : {}),
        jobDescription: job.description,
      };
      if (job.inputHash && job.inputHash !== jobHash(input, profile.resumeText, stories))
        throw new Error('Candidate facts changed during analysis; please analyze again');
      const profileHash = hash(
        JSON.stringify({ version: 'profile-v1', resumeText: profile.resumeText, stories }),
      );
      const parsed = structuredProfileSchema.safeParse(profile.structuredResume);
      const cachedProfile =
        profile.structuredResumeHash === profileHash && parsed.success ? parsed.data : undefined;
      const result = await this.runtime.workflows.prepare(
        {
          ...input,
          resumeText: profile.resumeText,
          stories,
          ...(cachedProfile ? { cachedProfile } : {}),
        },
        { operationId: `${id}:${job.inputHash ?? profileHash}:v1` },
      );
      await this.repository.saveStructuredProfile(profile.id, profileHash, result.profile);
      await this.repository.completeJob(id, owner, result.analysis);
    } catch (error) {
      await this.repository.failJob(
        id,
        owner,
        error instanceof Error ? error.message : 'Job analysis failed',
      );
      throw error;
    } finally {
      clearInterval(heartbeat);
    }
  }
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
function jobHash(input: JobAnalyzeInput, resumeText: string, stories: StoryInput[]) {
  return hash(
    JSON.stringify({
      version: 'agents-v1',
      profileId: input.profileId,
      targetRole: input.targetRole,
      company: input.company ?? null,
      jobDescription: input.jobDescription,
      resumeText,
      stories,
    }),
  );
}
