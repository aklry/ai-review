import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { InterviewWorkflows, type AgentModelGateway } from '@interview-assistant/agent-core';
import type { InterviewQuestion } from '@interview-assistant/contracts';
import { PrismaClient } from '../generated/prisma/client.js';
import { SessionRepository, type TurnCommit } from '../interview/session.repository.js';
import { InterviewRepository } from '../interview/interview.repository.js';
import { InterviewService } from '../interview/interview.service.js';
import { DeepSeekProvider } from '../deepseek/deepseek.provider.js';
import { AgentUsageGateway } from './agent-usage.gateway.js';
import type { WorkflowRuntime } from './workflow-runtime.service.js';

const connectionString = process.env.AGENT_INTEGRATION_DATABASE_URL;
const schema = `agent_test_${randomUUID().replaceAll('-', '')}`;
const competencies = ['vue-react', 'ai-application', 'system-design', 'project-depth'] as const;
const resumeText = 'I owned a Vue project and reduced LCP from 4.8s to 2.1s.';
const jobDescription = 'Build frontend and AI systems.';
const cue = {
  competency: 'project-depth' as const,
  score: 4,
  strengths: ['Ownership'],
  gaps: ['Validation'],
  nextAction: 'Explain validation.',
  referenceAnswer: {
    kind: 'experience-template' as const,
    content: 'Describe [your actual validation steps] and compare the measured results.',
    keyPoints: ['Explain validation and attribution'],
    missingFacts: ['Actual validation steps'],
  },
  evidence: [{ source: 'answer' as const, quote: 'reduced LCP' }],
};

describe.skipIf(!connectionString)('PostgreSQL workflow integration (isolated schema)', () => {
  let pool: pg.Pool;
  let prisma: PrismaClient;
  let sessions: SessionRepository;
  let saver: PostgresSaver | undefined;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: connectionString!, connectionTimeoutMillis: 5000 });
    const client = await pool.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      const root = resolve('prisma/migrations');
      const migrations = (await readdir(root)).filter((name) => /^\d/.test(name)).sort();
      for (const name of migrations) {
        if (name.startsWith('20261026')) {
          // Existing active sessions must resume a pending follow-up before the next base.
          await client.query(`INSERT INTO "CandidateProfile" (id,"resumeText","updatedAt") VALUES ('legacy-p','Legacy resume',NOW());
            INSERT INTO "Job" (id,"profileId","targetRole",description,"updatedAt") VALUES ('legacy-j','legacy-p','Engineer','Legacy JD',NOW());
            INSERT INTO "InterviewPlan" (id,"profileId","jobId",language,round,difficulty,"questionCount") VALUES ('legacy-plan','legacy-p','legacy-j','zh-CN','technical','l2',2);
            INSERT INTO "InterviewSession" (id,"planId","currentQuestionIndex") VALUES ('legacy-session','legacy-plan',1);
            INSERT INTO "InterviewQuestion" (id,"sessionId","order",competency,difficulty,prompt,"isCore") VALUES ('legacy-q1','legacy-session',0,'project-depth','l2','Base',true),('legacy-q2','legacy-session',1,'project-depth','l2','Next base',true),('legacy-followup','legacy-session',1000,'project-depth','l2','Follow-up',false);
            INSERT INTO "InterviewAnswer" (id,"sessionId","questionId","answerText") VALUES ('legacy-answer','legacy-session','legacy-q1','A legacy answer.');`);
        }
        await client.query(await readFile(resolve(root, name, 'migration.sql'), 'utf8'));
      }
    } finally {
      client.release();
    }
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: connectionString! }, { schema }),
    });
    await prisma.$connect();
    sessions = new SessionRepository(prisma);
  }, 60_000);

  afterAll(async () => {
    await saver?.end();
    await prisma?.$disconnect();
    if (pool) {
      // Only the randomly named schema created by this suite is removed.
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool.end();
    }
  }, 30_000);

  it('migrates legacy follow-ups and repairs the active base cursor', async () => {
    const session = await prisma.interviewSession.findUniqueOrThrow({
      where: { id: 'legacy-session' },
    });
    expect(session.activeQuestionId).toBe('legacy-followup');
    expect(session.currentQuestionIndex).toBe(0);
    expect(
      (await prisma.interviewQuestion.findUniqueOrThrow({ where: { id: 'legacy-q1' } }))
        .rubricSnapshot,
    ).toBeNull();
    expect(
      (await prisma.interviewQuestion.findUniqueOrThrow({ where: { id: 'legacy-followup' } }))
        .parentQuestionId,
    ).toBe('legacy-q1');
  }, 30_000);

  it('resumes a failed graph with a new PostgreSQL saver without repeating completed agents', async () => {
    const calls: string[] = [];
    let failJob = true;
    const gateway: AgentModelGateway = {
      async generateJson(request) {
        calls.push(request.taskType);
        if (request.taskType === 'job-analysis' && failJob)
          throw new Error('simulated process failure');
        const data =
          request.taskType === 'profile-analysis'
            ? {
                summary: 'Vue owner',
                skills: ['Vue'],
                projects: [],
                evidence: [{ source: 'resume', quote: 'I owned a Vue project' }],
                missingEvidence: [],
              }
            : {
                summary: 'Build reliable products',
                competencies: competencies.map((competency) => ({
                  competency,
                  priority: 'high',
                  summary: 'Practice',
                  focusAreas: ['delivery'],
                  evidence: [{ source: 'job_description', quote: jobDescription }],
                })),
                likelyQuestions: ['Describe a project'],
                missingEvidence: [],
              };
        return {
          data: request.schema.parse(data),
          model: 'fixture',
          degraded: false,
          usage: { inputTokens: 1, outputTokens: 1, cachedInputTokens: 0 },
        };
      },
    };
    saver = PostgresSaver.fromConnString(connectionString!, { schema });
    await saver.setup();
    const input = {
      profileId: 'p1',
      resumeText,
      stories: [],
      targetRole: 'Frontend',
      jobDescription,
    };
    await expect(
      new InterviewWorkflows(gateway, { checkpointer: saver }).prepare(input, {
        operationId: 'restart-test',
      }),
    ).rejects.toThrow('simulated process failure');
    await saver.end();
    saver = PostgresSaver.fromConnString(connectionString!, { schema });
    await saver.setup();
    failJob = false;
    const workflows = new InterviewWorkflows(gateway, { checkpointer: saver });
    expect(
      (await workflows.prepare(input, { operationId: 'restart-test' })).analysis.competencies,
    ).toHaveLength(4);
    await workflows.prepare(input, { operationId: 'restart-test' });
    expect(calls).toEqual(['profile-analysis', 'job-analysis', 'job-analysis']);
  }, 60_000);

  it('serializes real concurrent claims and rolls back a failed turn transaction', async () => {
    const profile = await prisma.candidateProfile.create({ data: { resumeText } });
    const job = await prisma.job.create({
      data: { profileId: profile.id, targetRole: 'Frontend', description: jobDescription },
    });
    const session = await sessions.create(
      {
        profileId: profile.id,
        jobId: job.id,
        language: 'zh-CN',
        round: 'technical',
        difficulty: 'l2',
        questionCount: 1,
      },
      [
        {
          id: 'q1',
          competency: 'project-depth',
          difficulty: 'l2',
          prompt: 'Describe a project.',
          isCore: true,
        },
      ],
    );
    const claims = await Promise.all(
      ['worker-a', 'worker-b'].map((token) =>
        sessions.claim(session.id, 0, token, new Date(Date.now() + 60_000)),
      ),
    );
    expect(claims.filter(Boolean)).toHaveLength(1);
    const owner = claims[0] ? 'worker-a' : 'worker-b';
    const qid = session.activeQuestionId!;
    const input: TurnCommit = {
      sessionId: session.id,
      questionId: qid,
      answerText: resumeText,
      requestHash: 'fixture-hash',
      cue,
      expectedVersion: 0,
      leaseToken: owner,
      response: {
        cue,
        nextQuestion: { ...session.questions[0]!, id: qid, parentQuestionId: qid },
        model: 'fixture',
        degraded: false,
        currentQuestionIndex: 0,
        activeQuestionId: qid,
        status: 'active',
      },
    };
    await expect(sessions.commit(input)).rejects.toThrow();
    expect(
      (await prisma.interviewSession.findUniqueOrThrow({ where: { id: session.id } })).version,
    ).toBe(0);
    expect(await prisma.interviewAnswer.count({ where: { sessionId: session.id } })).toBe(0);
    input.response = {
      ...input.response,
      nextQuestion: null,
      activeQuestionId: null,
      currentQuestionIndex: 1,
      status: 'awaiting_finish',
    };
    await sessions.commit(input);
    await expect(sessions.commit(input)).rejects.toThrow(/state changed/);
    expect(await prisma.interviewAnswer.count({ where: { sessionId: session.id } })).toBe(1);
    expect(await prisma.coachingCue.count({ where: { sessionId: session.id } })).toBe(1);
    expect(
      (await prisma.interviewAnswer.findUniqueOrThrow({ where: { questionId: qid } })).result,
    ).toEqual(input.response);
  }, 30_000);

  it('persists a complete SDK/graph/service interview with one follow-up and idempotent retries', async () => {
    const question = {
      id: 'fixture-question',
      competency: 'project-depth' as const,
      difficulty: 'l2' as const,
      prompt: 'Describe your contribution.',
      isCore: true,
    };
    const questions = [
      question,
      ...competencies
        .filter((c) => c !== 'project-depth')
        .map((competency) => ({
          ...question,
          competency,
        })),
    ];
    const outputs: unknown[] = [
      {
        summary: 'Vue owner',
        skills: ['Vue'],
        projects: [],
        evidence: [{ source: 'resume', quote: 'I owned a Vue project' }],
        missingEvidence: [],
      },
      {
        summary: 'Build reliable products',
        competencies: competencies.map((competency) => ({
          competency,
          priority: 'high',
          summary: 'Practice',
          focusAreas: ['delivery'],
          evidence: [{ source: 'job_description', quote: jobDescription }],
        })),
        likelyQuestions: ['Describe a project'],
        missingEvidence: [],
      },
      { ...cue, score: 2, followUpQuestion: 'How did you validate LCP?' },
      { question: { ...question, prompt: 'How did you validate LCP?', isCore: false } },
      { ...cue, score: 5 },
      ...questions.slice(1).map((q) => ({ ...cue, competency: q.competency })),
      {
        summary: 'Completed interview.',
        strengths: ['Ownership'],
        gaps: ['Validation'],
        nextPlan: Array.from({ length: 7 }, (_, i) => ({
          day: i + 1,
          focus: 'project-depth',
          task: 'Practice validation.',
          reason: 'Support the result.',
        })),
      },
    ];
    let modelCalls = 0;
    const provider = new DeepSeekProvider({
      apiKey: 'integration-fixture',
      baseUrl: 'https://fixture.invalid/v1',
      primaryModel: 'fixture',
      fallbackModel: 'fixture',
      transport: async (_url, init) => {
        const output = outputs.shift() as Record<string, unknown> | undefined;
        if (!output) throw new Error('Unexpected model call');
        const request = JSON.parse(init.body) as { messages: Array<{ content: string }> };
        const context = request.messages.at(-1)!.content;
        const current = context.match(/当前问题：([^\n]+)/)?.[1];
        if (current && typeof output.score === 'number') {
          const q = JSON.parse(current) as InterviewQuestion;
          output.competency = q.competency;
          if (q.rubricSnapshot) {
            const snapshot = q.rubricSnapshot;
            const score = output.score;
            output.rubricEvaluation = {
              bankId: snapshot.bankId,
              questionVersion: snapshot.questionVersion,
              rubricVersion: snapshot.rubricVersion,
              items: snapshot.criteria.map((criterion, i) => ({
                criterionId: criterion.id,
                status: i < score - 1 ? 'met' : 'missing',
                reason: 'Fixture evidence assessment',
                quotes: i < score - 1 ? ['reduced LCP'] : [],
              })),
            };
          }
        } else if (output.question) {
          const q = (JSON.parse(context) as { currentQuestion: InterviewQuestion }).currentQuestion;
          output.question = { ...(output.question as object), competency: q.competency };
        }
        modelCalls += 1;
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              id: `fixture-${modelCalls}`,
              object: 'chat.completion',
              created: 0,
              model: 'fixture',
              choices: [
                {
                  index: 0,
                  finish_reason: 'stop',
                  message: { role: 'assistant', content: JSON.stringify(output) },
                },
              ],
              usage: { prompt_tokens: 5, completion_tokens: 5, prompt_cache_hit_tokens: 1 },
            }),
        };
      },
    });
    const repository = new InterviewRepository(prisma);
    const service = new InterviewService(repository, {
      workflows: new InterviewWorkflows(new AgentUsageGateway(provider, repository), {
        checkpointer: saver!,
      }),
    } as WorkflowRuntime);
    try {
      const profile = await service.createProfile({ resumeText });
      const job = await service.analyzeJob({
        profileId: profile.id,
        targetRole: 'Frontend',
        jobDescription,
      });
      await vi.waitFor(
        async () => {
          expect((await repository.getJob(job.id)).analysisStatus).toBe('completed');
        },
        { timeout: 15_000, interval: 50 },
      );
      const session = await service.createSession({
        profileId: profile.id,
        jobId: job.id,
        language: 'zh-CN',
        round: 'technical',
        difficulty: 'l2',
        questionCount: 4,
      });
      expect(session.questions).toHaveLength(4);
      expect(session.questions.every((q) => q.rubricSnapshot?.rubricVersion === 'rubric-v3')).toBe(
        true,
      );
      expect(session.plan.job.targetRole).toBe('Frontend');
      const firstInput = { questionId: session.activeQuestionId!, answerText: resumeText };
      const first = await service.submitAnswer(session.id, firstInput);
      expect(first.currentQuestionIndex).toBe(0);
      expect(first.nextQuestion?.parentQuestionId).toBe(firstInput.questionId);
      const callsAfterFirst = modelCalls;
      expect(await service.submitAnswer(session.id, firstInput)).toEqual(first);
      expect(modelCalls).toBe(callsAfterFirst);
      await expect(
        service.submitAnswer(session.id, { ...firstInput, answerText: 'Changed answer' }),
      ).rejects.toThrow(/already submitted/);

      const followUp = await service.submitAnswer(session.id, {
        questionId: first.activeQuestionId!,
        answerText: resumeText,
      });
      expect(followUp.currentQuestionIndex).toBe(1);
      expect(followUp.nextQuestion?.parentQuestionId).toBeNull();
      let next = followUp;
      for (let i = 1; i < 4; i += 1) {
        next = await service.submitAnswer(session.id, {
          questionId: next.activeQuestionId!,
          answerText: resumeText,
        });
      }
      expect(next.status).toBe('awaiting_finish');
      expect(next.activeQuestionId).toBeNull();
      const restored = await service.getSession(session.id);
      expect(restored.questions).toHaveLength(5);
      expect(restored.questions.every((q) => q.answer?.cue?.referenceAnswer)).toBe(true);
      expect(restored.questions[1]?.answer?.cue?.followUpQuestion).toBeNull();
      const report = await service.finishSession(session.id);
      expect(report.scoringVersion).toBe('rubric-v3');
      expect(report.overallScore).toBe(76);
      expect(report.cues).toHaveLength(4);
      expect(report.supplementalCues).toHaveLength(1);
      expect(report.supplementalCues[0]?.score).toBe(5);
      expect(report.assessmentStatus).toBe('complete');
      const callsAfterReport = modelCalls;
      expect((await service.finishSession(session.id)).id).toBe(report.id);
      expect(modelCalls).toBe(callsAfterReport);
      expect((await service.getReport(session.id)).overallScore).toBe(76);
      expect((await service.getSession(session.id)).status).toBe('completed');
      const history = await service.listSessions({ page: 1, pageSize: 50, status: 'completed' });
      expect(history.items.find((item) => item.id === session.id)).toMatchObject({
        mainQuestionCount: 4,
        answeredMainQuestionCount: 4,
        followUpCount: 1,
        report: { overallScore: 76, scoringVersion: 'rubric-v3' },
      });
      const review = await service.getSessionReview(session.id);
      expect(review.questions).toHaveLength(5);
      expect(review.questions.filter((q) => q.parentQuestionId)).toHaveLength(1);
      expect(review.report?.cues).toHaveLength(4);
      expect(review.report?.cues.every((c) => c.rubricEvaluation?.items.length === 4)).toBe(true);
      expect(
        review.questions
          .filter((q) => !q.parentQuestionId)
          .every((q) => q.rubricSnapshot?.rubricVersion === 'rubric-v3'),
      ).toBe(true);
      expect(review.report?.supplementalCues).toHaveLength(1);
      expect(review.questions.every((q) => q.answer?.answerText === resumeText)).toBe(true);
      expect(
        review.questions.every(
          (q) =>
            JSON.stringify(q.answer?.cue?.referenceAnswer) === JSON.stringify(cue.referenceAnswer),
        ),
      ).toBe(true);
      expect(JSON.stringify(review)).not.toMatch(/requestHash|resumeText|turnLeaseToken/);
      const foreignProfile = await prisma.candidateProfile.create({
        data: { userKey: 'other-user', resumeText: 'A separate user profile.' },
      });
      const foreignJob = await prisma.job.create({
        data: {
          profileId: foreignProfile.id,
          targetRole: 'Other user role',
          description: 'Private job',
        },
      });
      const foreignSession = await sessions.create(
        {
          profileId: foreignProfile.id,
          jobId: foreignJob.id,
          language: 'zh-CN',
          round: 'technical',
          difficulty: 'l2',
          questionCount: 1,
        },
        [
          {
            id: 'foreign-q',
            competency: 'project-depth',
            difficulty: 'l2',
            prompt: 'Private question',
            isCore: true,
          },
        ],
      );
      expect(
        (await service.listSessions({ page: 1, pageSize: 50 })).items.some(
          (item) => item.id === foreignSession.id,
        ),
      ).toBe(false);
      await expect(service.getSessionReview(foreignSession.id)).rejects.toMatchObject({
        status: 404,
      });
      expect(await prisma.interviewAnswer.count({ where: { sessionId: session.id } })).toBe(5);
      const usage = await prisma.usageLedger.findMany({
        where: { sessionId: session.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(usage.map((entry) => entry.taskType)).toEqual([
        'coaching',
        'follow-up',
        'coaching',
        'coaching',
        'coaching',
        'coaching',
        'report',
      ]);
      expect(
        usage.every(
          (entry) => entry.operationId && entry.promptVersion && entry.cachedInputTokens === 1,
        ),
      ).toBe(true);
      expect(outputs).toHaveLength(0);
      expect(modelCalls).toBe(9);
    } finally {
      await service.onModuleDestroy();
    }
  }, 60_000);
});
