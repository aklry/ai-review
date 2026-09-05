import { describe, expect, it, vi } from 'vitest';
import type {
  CoachingCue,
  EvaluationReport,
  InterviewQuestion,
  JobAnalysis,
} from '@interview-assistant/contracts';
import { InterviewService } from './interview.service.js';

const cue: CoachingCue = {
  competency: 'project-depth',
  score: 4,
  strengths: ['quantified result'],
  gaps: ['validation detail'],
  nextAction: 'Add the validation method.',
  evidence: [{ source: 'answer', quote: 'LCP from 4.8s to 2.1s' }],
  followUpQuestion: 'How did you validate the optimization?',
};

const jobAnalysis: JobAnalysis = {
  summary: 'The role values AI application and project depth.',
  competencies: [
    {
      competency: 'project-depth',
      priority: 'high',
      summary: 'Needs measurable delivery evidence.',
      focusAreas: ['metrics', 'trade-offs'],
      evidence: [{ source: 'job_description', quote: 'Own project delivery.' }],
    },
  ],
  likelyQuestions: ['Tell me about a project.'],
  missingEvidence: [],
};

const question: InterviewQuestion = {
  id: 'q_1',
  competency: 'project-depth',
  difficulty: 'l2',
  prompt: 'Tell me about a performance project.',
  isCore: true,
};

const report: EvaluationReport = {
  summary: 'The answers included evidence.',
  overallScore: 68,
  competencyScores: {
    'vue-react': 3,
    'ai-application': 3,
    'system-design': 3,
    'project-depth': 4,
  },
  cues: [cue],
  strengths: ['quantified result'],
  gaps: ['validation detail'],
  nextPlan: Array.from({ length: 7 }, (_, index) => ({
    day: index + 1,
    focus: 'project-depth' as const,
    task: 'Practice one STAR story.',
    reason: 'Improve evidence.',
  })),
};

function createRepositoryMock() {
  return {
    createProfile: vi.fn(async (input: Record<string, unknown>) => ({ id: 'profile_1', ...input })),
    getProfile: vi.fn(async () => ({
      id: 'profile_1',
      resumeText: 'I owned Vue, RAG, and performance optimization projects.',
      structuredResume: null,
      stories: [],
    })),
    findJobByInput: vi.fn(async () => null),
    createJob: vi.fn(async () => ({
      id: 'job_1',
      profileId: 'profile_1',
      targetRole: 'AI Frontend Engineer',
      company: 'Example AI',
      description: 'Requires frontend and AI application experience.',
      analysis: jobAnalysis as unknown,
      analysisStatus: 'completed',
      analysisError: null,
    })),
    createProcessingJob: vi.fn(async () => ({
      id: 'job_1',
      profileId: 'profile_1',
      targetRole: 'AI Frontend Engineer',
      company: 'Example AI',
      description: 'Requires frontend and AI application experience.',
      analysis: null as unknown,
      analysisStatus: 'processing',
      analysisError: null,
    })),
    updateJobAnalysis: vi.fn(async () => ({
      id: 'job_1',
      profileId: 'profile_1',
      targetRole: 'AI Frontend Engineer',
      company: 'Example AI',
      description: 'Requires frontend and AI application experience.',
      analysis: jobAnalysis as unknown,
      analysisStatus: 'completed',
      analysisError: null,
    })),
    markJobAnalysisFailed: vi.fn(async () => undefined),
    getJob: vi.fn(async () => ({
      id: 'job_1',
      profileId: 'profile_1',
      targetRole: 'AI Frontend Engineer',
      company: 'Example AI',
      description: 'Requires frontend and AI application experience.',
      analysis: jobAnalysis as unknown,
      analysisStatus: 'completed',
      analysisError: null,
      profile: { id: 'profile_1', resumeText: 'I owned Vue and AI projects.' },
    })),
    createStory: vi.fn(async (profileId: string, input: Record<string, unknown>) => ({
      id: 'story_1',
      profileId,
      ...input,
    })),
    createSession: vi.fn(async () => ({
      id: 'session_1',
      planId: 'plan_1',
      questions: [question],
    })),
    createFollowUpQuestion: vi.fn(
      async (_sessionId: string, nextQuestion: InterviewQuestion) => nextQuestion,
    ),
    getSession: vi.fn(async () => ({
      id: 'session_1',
      status: 'active',
      currentQuestionIndex: 0,
      plan: {
        language: 'zh-CN',
        profile: { resumeText: 'I owned Vue and AI projects.' },
        job: {
          targetRole: 'AI Frontend Engineer',
          company: 'Example AI',
          description: 'Requires frontend and AI application experience.',
          analysis: jobAnalysis,
        },
      },
      questions: [question],
      cues: [] as Array<Record<string, unknown>>,
      report: null,
    })),
    saveAnswerFeedback: vi.fn(async () => ({ answerId: 'answer_1', cueId: 'cue_1' })),
    finishSession: vi.fn(async () => ({ id: 'report_1', sessionId: 'session_1', ...report })),
    getReport: vi.fn(async () => ({ id: 'report_1', sessionId: 'session_1', ...report })),
    recordUsage: vi.fn(async () => undefined),
  };
}

describe('InterviewService', () => {
  it('starts job analysis in the background and returns a processing job', async () => {
    const repository = createRepositoryMock();
    const provider = {
      generateJson: vi.fn(async () => ({
        data: jobAnalysis,
        model: 'deepseek-v4-pro',
        degraded: false,
        usage: { inputTokens: 10, outputTokens: 20, cachedInputTokens: 0 },
      })),
    };
    const service = new InterviewService(repository as never, provider as never);

    const result = await service.analyzeJob({
      profileId: 'profile_1',
      targetRole: 'AI Frontend Engineer',
      company: 'Example AI',
      jobDescription: 'Requires frontend and AI application experience.',
    });

    expect(repository.createProcessingJob).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: 'profile_1', targetRole: 'AI Frontend Engineer' }),
    );
    expect(result).toMatchObject({ id: 'job_1', analysis: null, analysisStatus: 'processing' });
    await vi.waitFor(() => expect(repository.updateJobAnalysis).toHaveBeenCalledWith('job_1', jobAnalysis));
  });

  it('marks the analysis job failed when background generation fails', async () => {
    const repository = createRepositoryMock();
    const provider = {
      generateJson: vi.fn(async () => {
        throw new Error('provider timeout');
      }),
    };
    const service = new InterviewService(repository as never, provider as never);

    await service.analyzeJob({
      profileId: 'profile_1',
      targetRole: 'AI Frontend Engineer',
      company: 'Example AI',
      jobDescription: 'Requires frontend and AI application experience.',
    });

    await vi.waitFor(() =>
      expect(repository.markJobAnalysisFailed).toHaveBeenCalledWith('job_1', 'provider timeout'),
    );
  });

  it('reuses an existing analysis for the same profile and job input', async () => {
    const repository = createRepositoryMock();
    repository.findJobByInput.mockResolvedValue({
      id: 'job_existing',
      profileId: 'profile_1',
      targetRole: 'AI Frontend Engineer',
      company: 'Example AI',
      description: 'Requires frontend and AI application experience.',
      analysis: jobAnalysis as unknown,
      analysisStatus: 'completed',
      analysisError: null,
    } as never);
    const provider = {
      generateJson: vi.fn(),
    };
    const service = new InterviewService(repository as never, provider as never);

    await expect(
      service.analyzeJob({
        profileId: 'profile_1',
        targetRole: 'AI Frontend Engineer',
        company: 'Example AI',
        jobDescription: 'Requires frontend and AI application experience.',
      }),
    ).resolves.toMatchObject({ id: 'job_existing', analysis: jobAnalysis });
    expect(provider.generateJson).not.toHaveBeenCalled();
    expect(repository.createProcessingJob).not.toHaveBeenCalled();
  });

  it('returns a job status snapshot for polling', async () => {
    const repository = createRepositoryMock();
    const provider = { generateJson: vi.fn() };
    const service = new InterviewService(repository as never, provider as never);

    await expect(service.getJob('job_1')).resolves.toMatchObject({
      id: 'job_1',
      analysisStatus: 'completed',
      analysis: jobAnalysis,
    });
  });

  it('rejects session creation until analysis is completed', async () => {
    const repository = createRepositoryMock();
    repository.getJob.mockResolvedValue({
      id: 'job_1',
      profileId: 'profile_1',
      targetRole: 'AI Frontend Engineer',
      company: 'Example AI',
      description: 'Requires frontend and AI application experience.',
      analysis: undefined,
      analysisStatus: 'processing',
      analysisError: null,
      profile: { id: 'profile_1', resumeText: 'I owned Vue and AI projects.' },
    });
    const provider = {
      generateJson: vi.fn(async () => ({
        data: { questions: [question] },
        model: 'deepseek-v4-pro',
        degraded: false,
        usage: { inputTokens: 10, outputTokens: 20, cachedInputTokens: 0 },
      })),
    };
    const service = new InterviewService(repository as never, provider as never);

    await expect(
      service.createSession({
        profileId: 'profile_1',
        jobId: 'job_1',
        language: 'zh-CN',
        round: 'technical',
        difficulty: 'l2',
        questionCount: 1,
      }),
    ).rejects.toThrow(/analysis/i);
    expect(provider.generateJson).not.toHaveBeenCalled();
  });

  it('creates a persisted interview session from model-generated questions', async () => {
    const repository = createRepositoryMock();
    const provider = {
      generateJson: vi.fn(async () => ({
        data: { questions: [question] },
        model: 'deepseek-v4-pro',
        degraded: false,
        usage: { inputTokens: 10, outputTokens: 20, cachedInputTokens: 0 },
      })),
    };
    const service = new InterviewService(repository as never, provider as never);

    const result = await service.createSession({
      profileId: 'profile_1',
      jobId: 'job_1',
      language: 'zh-CN',
      round: 'technical',
      difficulty: 'l2',
      questionCount: 1,
    });

    expect(provider.generateJson).toHaveBeenCalledOnce();
    expect(repository.createSession).toHaveBeenCalledWith(expect.anything(), [question]);
    expect(result.questions).toEqual([question]);
  });

  it('persists DeepSeek coaching and exposes the follow-up question', async () => {
    const repository = createRepositoryMock();
    const provider = {
      generateJson: vi.fn(async () => ({
        data: cue,
        model: 'deepseek-v4-pro',
        degraded: false,
        usage: { inputTokens: 10, outputTokens: 20, cachedInputTokens: 0 },
      })),
    };
    const service = new InterviewService(repository as never, provider as never);

    const result = await service.submitAnswer('session_1', {
      questionId: 'q_1',
      answerText: 'I reduced LCP from 4.8s to 2.1s.',
    });

    expect(repository.saveAnswerFeedback).toHaveBeenCalledWith({
      sessionId: 'session_1',
      questionId: 'q_1',
      answerText: 'I reduced LCP from 4.8s to 2.1s.',
      cue,
    });
    expect(repository.createFollowUpQuestion).toHaveBeenCalledWith(
      'session_1',
      expect.objectContaining({
        prompt: 'How did you validate the optimization?',
        isCore: false,
      }),
      expect.any(Number),
    );
    expect(result.cue).toEqual(cue);
    expect(result.nextQuestion?.prompt).toBe('How did you validate the optimization?');
  });

  it('builds and persists a report with deterministic weighted scores', async () => {
    const repository = createRepositoryMock();
    repository.getSession.mockResolvedValue({
      id: 'session_1',
      status: 'active',
      currentQuestionIndex: 1,
      plan: {
        language: 'zh-CN',
        profile: { resumeText: 'I owned Vue and AI projects.' },
        job: {
          targetRole: 'AI Frontend Engineer',
          company: 'Example AI',
          description: 'Requires frontend and AI application experience.',
          analysis: jobAnalysis,
        },
      },
      questions: [question],
      cues: [cue],
      report: null,
    });
    const provider = {
      generateJson: vi.fn(async () => ({
        data: report,
        model: 'deepseek-v4-pro',
        degraded: false,
        usage: { inputTokens: 10, outputTokens: 20, cachedInputTokens: 0 },
      })),
    };
    const service = new InterviewService(repository as never, provider as never);

    const result = await service.finishSession('session_1');

    expect(provider.generateJson).toHaveBeenCalledOnce();
    expect(repository.finishSession).toHaveBeenCalledWith(
      'session_1',
      expect.objectContaining({
        overallScore: 68,
        competencyScores: {
          'vue-react': 3,
          'ai-application': 3,
          'system-design': 3,
          'project-depth': 4,
        },
      }),
    );
    expect(result.overallScore).toBe(68);
  });
});
