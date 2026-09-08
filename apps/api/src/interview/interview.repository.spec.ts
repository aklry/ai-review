import { describe, expect, it, vi } from 'vitest';
import type {
  CoachingCue,
  EvaluationReport,
  InterviewSessionCreateInput,
  ProfileInput,
} from '@interview-assistant/contracts';
import { InterviewRepository } from './interview.repository.js';
import { Prisma } from '../generated/prisma/client.js';

describe('InterviewRepository', () => {
  it('persists a profile through Prisma', async () => {
    const profile = {
      id: 'profile_1',
      resumeText: 'A sufficiently long resume for the MVP test.',
      displayName: 'Ada',
    };
    const prisma = {
      candidateProfile: {
        create: async ({ data }: { data: unknown }) => {
          expect(data).toEqual({
            userKey: 'local-user',
            displayName: 'Ada',
            resumeText: 'A sufficiently long resume for the MVP test.',
          });
          return profile;
        },
      },
    };
    const repository = new InterviewRepository(prisma as never);

    await expect(
      repository.createProfile({
        resumeText: profile.resumeText,
        displayName: profile.displayName,
      } satisfies ProfileInput),
    ).resolves.toEqual(profile);
  });

  it('creates a plan, session, and ordered questions with session-scoped ids', async () => {
    const calls: string[] = [];
    const prisma = {
      interviewPlan: {
        create: async ({ data }: { data: unknown }) => {
          calls.push('plan');
          expect(data).toMatchObject({
            profileId: 'profile_1',
            jobId: 'job_1',
            language: 'zh-CN',
            round: 'technical',
            difficulty: 'l2',
            questionCount: 2,
          });
          return { id: 'plan_1' };
        },
      },
      interviewSession: {
        create: async ({ data }: { data: unknown }) => {
          calls.push('session');
          expect(data).toMatchObject({ planId: 'plan_1', mode: 'simulation' });
          return { id: 'session_1', planId: 'plan_1' };
        },
      },
      interviewQuestion: {
        createMany: async ({ data }: { data: unknown }) => {
          calls.push('questions');
          expect(data).toEqual([
            {
              sessionId: 'session_1',
              order: 0,
              id: 'session_1:0:q_1',
              competency: 'project-depth',
              difficulty: 'l2',
              prompt: 'Tell me about a project.',
              isCore: true,
            },
            {
              sessionId: 'session_1',
              order: 1,
              id: 'session_1:1:q_1',
              competency: 'project-depth',
              difficulty: 'l2',
              prompt: 'Tell me about another project.',
              isCore: false,
            },
          ]);
          return { count: 1 };
        },
      },
    };
    const repository = new InterviewRepository(prisma as never);
    const input = {
      profileId: 'profile_1',
      jobId: 'job_1',
      language: 'zh-CN',
      round: 'technical',
      difficulty: 'l2',
      questionCount: 2,
    } satisfies InterviewSessionCreateInput;

    const result = await repository.createSession(input, [
      {
        id: 'q_1',
        competency: 'project-depth',
        difficulty: 'l2',
        prompt: 'Tell me about a project.',
        isCore: true,
      },
      {
        id: 'q_1',
        competency: 'project-depth',
        difficulty: 'l2',
        prompt: 'Tell me about another project.',
        isCore: false,
      },
    ]);

    expect(calls).toEqual(['plan', 'session', 'questions']);
    expect(result.questions.map((item) => item.id)).toEqual(['session_1:0:q_1', 'session_1:1:q_1']);
  });

  it('creates a processing job for analysis', async () => {
    const prisma = {
      job: {
        create: async ({ data }: { data: unknown }) => {
          expect(data).toMatchObject({
            profileId: 'profile_1',
            targetRole: 'AI Frontend Engineer',
            company: 'Example AI',
            description: '需要前端和 AI 应用经验，能负责系统设计。',
            analysis: Prisma.DbNull,
            analysisStatus: 'processing',
            analysisError: null,
          });
          return {
            id: 'job_1',
            profileId: 'profile_1',
            targetRole: 'AI Frontend Engineer',
            company: 'Example AI',
            description: '需要前端和 AI 应用经验，能负责系统设计。',
            analysis: null,
            analysisStatus: 'processing',
            analysisError: null,
          };
        },
      },
    };
    const repository = new InterviewRepository(prisma as never);

    await expect(
      repository.createProcessingJob({
        profileId: 'profile_1',
        targetRole: 'AI Frontend Engineer',
        company: 'Example AI',
        jobDescription: '需要前端和 AI 应用经验，能负责系统设计。',
      }),
    ).resolves.toMatchObject({
      id: 'job_1',
      analysisStatus: 'processing',
      analysis: null,
      analysisError: null,
    });
  });

  it.each([0, 1])(
    'claims a failed job for retry only when the conditional update affects %i rows',
    async (count) => {
      const updateMany = vi.fn(async () => ({ count }));
      const repository = new InterviewRepository({ job: { updateMany } } as never);

      await expect(repository.retryFailedJob('job_1')).resolves.toBe(count === 1);
      expect(updateMany).toHaveBeenCalledWith({
        where: { id: 'job_1', analysisStatus: 'failed' },
        data: { analysis: Prisma.DbNull, analysisStatus: 'processing', analysisError: null },
      });
    },
  );

  it('updates job analysis status', async () => {
    const prisma = {
      job: {
        update: async ({ where, data }: { where: { id: string }; data: unknown }) => {
          expect(where).toEqual({ id: 'job_1' });
          expect(data).toMatchObject({
            analysisStatus: 'completed',
            analysisError: null,
          });
          return {
            id: 'job_1',
            analysisStatus: 'completed',
            analysisError: null,
          };
        },
      },
    };
    const repository = new InterviewRepository(prisma as never);

    await expect(
      repository.updateJobAnalysis('job_1', {
        summary: 'Strong product depth.',
        competencies: [
          {
            competency: 'project-depth',
            priority: 'high',
            summary: 'Needs sharper evidence.',
            focusAreas: ['metrics'],
            evidence: [{ source: 'resume', quote: 'Launched an internal platform.' }],
          },
        ],
        likelyQuestions: ['Tell me about a launch.'],
        missingEvidence: ['system tradeoffs'],
      }),
    ).resolves.toMatchObject({
      id: 'job_1',
      analysisStatus: 'completed',
      analysisError: null,
    });
  });

  it('marks job analysis failure', async () => {
    const prisma = {
      job: {
        update: async ({ where, data }: { where: { id: string }; data: unknown }) => {
          expect(where).toEqual({ id: 'job_1' });
          expect(data).toMatchObject({
            analysisStatus: 'failed',
            analysisError: 'provider timeout',
          });
          return {
            id: 'job_1',
            analysisStatus: 'failed',
            analysisError: 'provider timeout',
          };
        },
      },
    };
    const repository = new InterviewRepository(prisma as never);

    await expect(
      repository.markJobAnalysisFailed('job_1', 'provider timeout'),
    ).resolves.toMatchObject({
      id: 'job_1',
      analysisStatus: 'failed',
      analysisError: 'provider timeout',
    });
  });

  it('persists an answer and its coaching cue as linked rows', async () => {
    const prisma = {
      interviewAnswer: {
        upsert: async ({ create }: { create: unknown }) => {
          expect(create).toMatchObject({
            sessionId: 'session_1',
            questionId: 'q_1',
            answerText: 'I reduced LCP from 4.8s to 2.1s.',
          });
          return { id: 'answer_1' };
        },
      },
      coachingCue: {
        upsert: async ({ create }: { create: unknown }) => {
          expect(create).toMatchObject({
            sessionId: 'session_1',
            answerId: 'answer_1',
            competency: 'project-depth',
            score: 4,
            nextAction: 'Add the validation method.',
          });
          return { id: 'cue_1' };
        },
      },
      interviewSession: {
        update: async ({ data }: { data: unknown }) => {
          expect(data).toEqual({ currentQuestionIndex: { increment: 1 } });
          return { id: 'session_1' };
        },
      },
    };
    const repository = new InterviewRepository(prisma as never);
    const cue = {
      competency: 'project-depth',
      score: 4,
      strengths: ['quantified result'],
      gaps: ['validation'],
      nextAction: 'Add the validation method.',
      evidence: [{ source: 'answer', quote: 'LCP from 4.8s to 2.1s' }],
    } satisfies CoachingCue;

    await expect(
      repository.saveAnswerFeedback({
        sessionId: 'session_1',
        questionId: 'q_1',
        answerText: 'I reduced LCP from 4.8s to 2.1s.',
        cue,
      }),
    ).resolves.toEqual({ answerId: 'answer_1', cueId: 'cue_1' });
  });

  it('persists a finished report for a session', async () => {
    const report = {
      summary: 'Good technical depth.',
      overallScore: 74,
      competencyScores: {
        'vue-react': 3,
        'ai-application': 3,
        'system-design': 4,
        'project-depth': 4,
      },
      cues: [],
      strengths: ['clear result'],
      gaps: ['more trade-offs'],
      nextPlan: Array.from({ length: 7 }, (_, index) => ({
        day: index + 1,
        focus: 'project-depth' as const,
        task: 'Practice one STAR story.',
        reason: 'Improve evidence.',
      })),
    } satisfies EvaluationReport;
    const prisma = {
      evaluationReport: {
        upsert: async ({ create }: { create: unknown }) => {
          expect(create).toMatchObject({
            sessionId: 'session_1',
            summary: report.summary,
            overallScore: 74,
          });
          return { id: 'report_1', sessionId: 'session_1', ...report };
        },
      },
      interviewSession: {
        update: async ({ data }: { data: unknown }) => {
          expect(data).toMatchObject({ status: 'completed' });
          return { id: 'session_1', status: 'completed' };
        },
      },
    };
    const repository = new InterviewRepository(prisma as never);

    await expect(repository.finishSession('session_1', report)).resolves.toMatchObject({
      id: 'report_1',
      sessionId: 'session_1',
    });
  });
});
