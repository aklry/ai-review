import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type {
  EvaluationReport,
  InterviewQuestion,
  JobAnalysis,
  JobRecord,
} from '@interview-assistant/contracts';
import * as api from '../api/interview.js';
import type { CoachingResult, SessionRecord } from '../api/interview.js';
import { ApiClientError } from '../lib/http.js';
import { useTrainingStore } from './training.js';

vi.mock('../api/interview.js');

const storageKey = 'interview-assistant.training.v1';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

const question: InterviewQuestion = {
  id: 'question_1',
  competency: 'project-depth',
  difficulty: 'l2',
  prompt: 'Describe your project.',
  isCore: true,
};

function job(status: JobRecord['analysisStatus'] = 'processing'): JobRecord {
  return {
    id: 'job_1',
    profileId: 'profile_1',
    targetRole: 'Frontend',
    company: null,
    description: 'Authoritative server job description.',
    analysis: status === 'completed' ? analysis : null,
    analysisStatus: status,
    analysisError: null,
  };
}

function session(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 'session_1',
    status: 'active',
    currentQuestionIndex: 0,
    activeQuestionId: question.id,
    version: 1,
    questions: [question, { ...question, id: 'question_2' }],
    plan: {
      profileId: 'profile_1',
      jobId: 'job_1',
      language: 'zh-CN',
      round: 'technical',
      difficulty: 'l2',
      profile: { resumeText: 'Private server resume.', displayName: 'Candidate' },
      job: job('completed'),
    },
    ...overrides,
  };
}

function answerResult(overrides: Partial<CoachingResult> = {}): CoachingResult {
  return {
    cue: {
      competency: 'project-depth',
      score: 4,
      strengths: ['clear'],
      gaps: [],
      nextAction: 'Continue',
      evidence: [{ source: 'answer', quote: 'I built it.' }],
    },
    nextQuestion: null,
    currentQuestionIndex: 2,
    activeQuestionId: null,
    status: 'awaiting_finish',
    model: 'test-model',
    degraded: false,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

const analysis: JobAnalysis = {
  summary: 'The role cares about project depth.',
  competencies: [
    {
      competency: 'project-depth',
      priority: 'high',
      summary: 'Needs measurable evidence.',
      focusAreas: ['metrics'],
      evidence: [{ source: 'job_description', quote: 'Own project delivery.' }],
    },
  ],
  likelyQuestions: ['Tell me about a project.'],
  missingEvidence: [],
};

describe('training store', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.getInterviewSession).mockResolvedValue(session());
    vi.stubGlobal('localStorage', memoryStorage());
    vi.useFakeTimers();
    setActivePinia(createPinia());
  });

  afterEach(() => {
    useTrainingStore().deactivate();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('restores drafts per question and clears them after a successful submission', async () => {
    const store = useTrainingStore();
    await store.activate('session_1');
    store.answerText = 'unsent answer';
    store.applySession(session({ activeQuestionId: 'question_2' }));
    expect(store.answerText).toBe('');
    store.applySession(session());
    expect(store.answerText).toBe('unsent answer');
    vi.mocked(api.submitAnswer).mockResolvedValue(answerResult());
    await store.sendAnswer();
    expect(localStorage.getItem('interview.draft.session_1.' + question.id)).toBeNull();
  });

  it('resumes an explicitly selected historical session ahead of saved or in-memory IDs', async () => {
    const store = useTrainingStore();
    store.sessionId = 'current-session';
    localStorage.setItem(
      storageKey,
      JSON.stringify({ sessionId: 'saved-session', jobId: 'old-job' }),
    );
    vi.mocked(api.getInterviewSession).mockResolvedValue(session({ id: 'older-session' }));
    await store.activate('older-session');
    expect(api.getInterviewSession).toHaveBeenCalledExactlyOnceWith('older-session');
    expect(store.sessionId).toBe('older-session');
    expect(store.currentQuestion?.id).toBe(question.id);
  });

  it('does not fall back to another job when the explicitly selected historical session is missing', async () => {
    const store = useTrainingStore();
    localStorage.setItem(
      storageKey,
      JSON.stringify({ sessionId: 'saved-session', jobId: 'old-job' }),
    );
    vi.mocked(api.getInterviewSession).mockRejectedValue(
      new ApiClientError({
        code: 404,
        status: 404,
        message: 'not found',
        requestId: 'missing-history',
      }),
    );
    await store.activate('missing-session');
    expect(api.getJob).not.toHaveBeenCalled();
    expect(store.sessionId).toBe('');
    expect(store.phase).toBe('setup');
    expect(store.errorMessage).toContain('指定训练记录已不存在');
  });

  it('waits for the selected session mutation even when another session also has a pending write', async () => {
    const store = useTrainingStore();
    const pendingA = deferred<CoachingResult>();
    const pendingB = deferred<CoachingResult>();
    let committedA = false;
    vi.mocked(api.getInterviewSession).mockImplementation(async (id) =>
      session({
        id,
        currentQuestionIndex: id === 'A' && committedA ? 1 : 0,
        activeQuestionId: id === 'A' && committedA ? 'question_2' : question.id,
      }),
    );
    vi.mocked(api.submitAnswer).mockImplementation((id) =>
      id === 'A' ? pendingA.promise : pendingB.promise,
    );
    await store.activate('A');
    store.answerText = 'Answer A';
    const writeA = store.sendAnswer();
    await store.activate('B');
    store.answerText = 'Answer B';
    const writeB = store.sendAnswer();
    const restoreA = store.activate('A');
    await settle();
    expect(vi.mocked(api.getInterviewSession).mock.calls.filter(([id]) => id === 'A')).toHaveLength(
      1,
    );
    committedA = true;
    pendingA.resolve(answerResult());
    await writeA;
    await restoreA;
    expect(store.currentQuestion?.id).toBe('question_2');
    pendingB.resolve(answerResult());
    await writeB;
    expect(store.sessionId).toBe('A');
    expect(store.currentQuestion?.id).toBe('question_2');
  });

  it('keeps preparation state when the route component is recreated', () => {
    const firstInstance = useTrainingStore();
    firstInstance.profileId = 'profile_1';
    firstInstance.jobDescription = 'Requires frontend and AI application experience.';
    firstInstance.analysis = analysis;
    firstInstance.analysisStatus = 'processing';
    firstInstance.analysisJobId = 'job_1';

    const recreatedInstance = useTrainingStore();

    expect(recreatedInstance.profileId).toBe('profile_1');
    expect(recreatedInstance.jobDescription).toContain('frontend and AI');
    expect(recreatedInstance.analysis).toEqual(analysis);
    expect(recreatedInstance.analysisStatus).toBe('processing');
    expect(recreatedInstance.analysisJobId).toBe('job_1');
  });

  it('clears all workflow state when explicitly restarted', () => {
    const store = useTrainingStore();
    store.profileId = 'profile_1';
    store.jobId = 'job_1';
    store.analysis = analysis;
    store.analysisStatus = 'failed';
    store.analysisError = 'provider timeout';
    store.analysisJobId = 'job_1';
    store.stories.push({
      title: 'Optimization',
      project: 'Work app',
      situation: 'The page was slow',
      task: 'Reduce the initial load time',
      action: 'Split bundles and trim assets',
      result: 'LCP dropped',
      metrics: ['2.1s'],
    });

    store.restart();

    expect(store.profileId).toBe('');
    expect(store.jobId).toBe('');
    expect(store.analysis).toBeNull();
    expect(store.analysisStatus).toBe('pending');
    expect(store.analysisError).toBeNull();
    expect(store.analysisJobId).toBe('');
    expect(store.stories).toEqual([]);
  });

  it('resumes analysis polling after leaving and returning to the route', async () => {
    const store = useTrainingStore();
    store.jobId = store.analysisJobId = 'job_1';
    store.phase = 'analysis';
    store.analysisStatus = 'processing';
    vi.mocked(api.getJob).mockResolvedValueOnce(job()).mockResolvedValueOnce(job('completed'));

    await store.activate();
    await settle();
    store.deactivate();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(store.analysis).toBeNull();

    await store.activate();
    await settle();
    expect(store.analysis).toEqual(analysis);
    expect(store.analysisStatus).toBe('completed');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('never overlaps slow polling requests, including a remount', async () => {
    const store = useTrainingStore();
    store.jobId = store.analysisJobId = 'job_1';
    store.phase = 'analysis';
    const slow = deferred<JobRecord>();
    let activeRequests = 0;
    let maximumRequests = 0;
    vi.mocked(api.getJob).mockImplementation(async () => {
      activeRequests += 1;
      maximumRequests = Math.max(maximumRequests, activeRequests);
      const result = await slow.promise;
      activeRequests -= 1;
      return result;
    });

    await store.activate();
    await settle();
    await vi.advanceTimersByTimeAsync(12_000);
    store.deactivate();
    await store.activate();
    await settle();
    slow.resolve(job('completed'));
    await settle();

    expect(maximumRequests).toBe(1);
    expect(store.analysisStatus).toBe('completed');
  });

  it.each(['restart', 'deactivate'] as const)(
    'ignores an analysis response after %s',
    async (action) => {
      const store = useTrainingStore();
      store.jobId = store.analysisJobId = 'job_1';
      store.phase = 'analysis';
      const slow = deferred<JobRecord>();
      vi.mocked(api.getJob).mockReturnValue(slow.promise);
      await store.activate();
      await settle();

      store[action]();
      slow.resolve(job('completed'));
      await settle();

      expect(store.analysis).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('ignores a poll for a replaced job even when the old request finishes later', async () => {
    const store = useTrainingStore();
    store.jobId = store.analysisJobId = 'job_1';
    store.phase = 'analysis';
    const slow = deferred<JobRecord>();
    vi.mocked(api.getJob)
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValue({ ...job('failed'), id: 'job_2', analysisError: 'New job failed' });
    await store.activate();
    await settle();
    store.jobId = store.analysisJobId = 'job_2';
    slow.resolve(job('completed'));
    await settle();

    expect(store.analysis).toBeNull();
    expect(store.analysisStatus).toBe('failed');
    expect(store.analysisError).toBe('New job failed');
  });

  it('recovers from a transient polling error without retaining an obsolete error banner', async () => {
    const store = useTrainingStore();
    store.jobId = store.analysisJobId = 'job_1';
    store.phase = 'analysis';
    vi.mocked(api.getJob)
      .mockRejectedValueOnce(
        new ApiClientError({
          code: 0,
          status: undefined,
          message: 'Network unavailable',
          requestId: undefined,
        }),
      )
      .mockResolvedValue(job('completed'));

    await store.activate();
    await settle();
    expect(store.errorMessage).toBe('Network unavailable');
    await vi.advanceTimersByTimeAsync(2_000);

    expect(store.analysisStatus).toBe('completed');
    expect(store.errorMessage).toBe('');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears a deleted analysis identifier and returns to setup after refresh', async () => {
    localStorage.setItem(storageKey, JSON.stringify({ jobId: 'deleted_job' }));
    vi.mocked(api.getJob).mockRejectedValue(
      new ApiClientError({ code: 404, status: 404, message: 'Job deleted', requestId: undefined }),
    );
    const store = useTrainingStore();

    await store.activate();

    expect(store.phase).toBe('setup');
    expect(store.jobId).toBe('');
    expect(localStorage.getItem(storageKey)).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the final question and prevents another answer after a null next question', async () => {
    const store = useTrainingStore();
    store.applySession(session());
    await store.activate();
    store.answerText = 'I built it.';
    vi.mocked(api.submitAnswer).mockResolvedValue(answerResult());

    await store.sendAnswer();
    expect(store.currentQuestion).toBeNull();
    expect(store.latestAnsweredQuestion?.id).toBe(question.id);
    expect(store.answerText).toBe('');
    expect(store.answersComplete).toBe(true);
    expect(store.canSubmitAnswer).toBe(false);
    store.answerText = 'Accidental duplicate';
    await store.sendAnswer();
    expect(api.submitAnswer).toHaveBeenCalledTimes(1);
  });

  it('uses the server base index for a follow-up instead of incrementing it', async () => {
    const store = useTrainingStore();
    store.applySession(session());
    await store.activate();
    store.answerText = 'I built it.';
    const followUp = { ...question, id: 'follow_up', parentQuestionId: question.id };
    vi.mocked(api.submitAnswer).mockResolvedValue(
      answerResult({
        nextQuestion: followUp,
        activeQuestionId: followUp.id,
        currentQuestionIndex: 0,
        status: 'active',
      }),
    );

    await store.sendAnswer();

    expect(store.currentQuestionIndex).toBe(0);
    expect(store.currentQuestion?.id).toBe('follow_up');
    expect(store.latestAnsweredQuestion?.id).toBe(question.id);
    expect(store.session?.activeQuestionId).toBe('follow_up');
    expect(store.baseQuestionCount).toBe(2);
  });

  it.each(['restart', 'deactivate'] as const)(
    'does not apply an answer response after %s',
    async (action) => {
      const store = useTrainingStore();
      store.applySession(session());
      await store.activate();
      store.answerText = 'I built it.';
      const slow = deferred<CoachingResult>();
      vi.mocked(api.submitAnswer).mockReturnValue(slow.promise);
      const request = store.sendAnswer();
      store[action]();
      slow.resolve(answerResult());
      await request;

      expect(store.latestCue).toBeNull();
      expect(store.phase).toBe(action === 'restart' ? 'setup' : 'interview');
    },
  );

  it.each(['answer', 'report'] as const)(
    'waits for a pending %s before recovering the same session on remount',
    async (operation) => {
      const store = useTrainingStore();
      store.applySession(session());
      await store.activate();
      const pending = deferred<never>();
      vi.mocked(api.submitAnswer).mockReturnValue(pending.promise);
      vi.mocked(api.finishInterviewSession).mockReturnValue(pending.promise);
      store.answerText = 'I built it.';
      const request = operation === 'answer' ? store.sendAnswer() : store.finishInterview();
      store.deactivate();
      const recovery = store.activate();
      await settle();
      expect(api.getInterviewSession).toHaveBeenCalledTimes(1);
      expect(store.loading).toBe(true);

      const completedReport: EvaluationReport = {
        summary: 'Committed report',
        overallScore: null,
        competencyScores: {
          'vue-react': null,
          'ai-application': null,
          'system-design': null,
          'project-depth': 4,
        },
        cues: [],
        strengths: [],
        gaps: [],
        nextPlan: [],
      };
      vi.mocked(api.getInterviewSession).mockResolvedValue(
        session({
          status: operation === 'answer' ? 'awaiting_finish' : 'completed',
          activeQuestionId: null,
          currentQuestionIndex: 2,
        }),
      );
      vi.mocked(api.getReport).mockResolvedValue(completedReport);
      pending.resolve((operation === 'answer' ? answerResult() : completedReport) as never);
      await Promise.all([request, recovery]);

      expect(store.currentQuestion).toBeNull();
      expect(store.phase).toBe(operation === 'answer' ? 'interview' : 'report');
      expect(store.session?.status).toBe(operation === 'answer' ? 'awaiting_finish' : 'completed');
      expect(store.loading).toBe(false);
      if (operation === 'report') expect(store.report?.summary).toBe('Committed report');
    },
  );

  it('persists only identifiers and clears them on restart', async () => {
    const store = useTrainingStore();
    store.resumeText = 'Private resume';
    store.jobDescription = 'Private JD';
    store.answerText = 'Private answer';
    store.applySession(session());
    await settle();

    expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual({
      jobId: 'job_1',
      sessionId: 'session_1',
    });
    store.restart();
    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it('recovers the active follow-up and private context only from the server', async () => {
    localStorage.setItem(storageKey, JSON.stringify({ sessionId: 'session_1', jobId: 'job_1' }));
    const followUp = { ...question, id: 'follow_up', parentQuestionId: question.id };
    vi.mocked(api.getInterviewSession).mockResolvedValue(
      session({ questions: [question, followUp], activeQuestionId: followUp.id }),
    );
    const store = useTrainingStore();

    await store.activate();

    expect(store.phase).toBe('interview');
    expect(store.currentQuestion?.id).toBe('follow_up');
    expect(store.currentQuestionIndex).toBe(0);
    expect(store.resumeText).toBe('Private server resume.');
    expect(store.jobDescription).toBe('Authoritative server job description.');
    expect(store.answerText).toBe('');
  });

  it('recovers a finished report without coercing null scores to zero', async () => {
    localStorage.setItem(storageKey, JSON.stringify({ sessionId: 'session_1' }));
    vi.mocked(api.getInterviewSession).mockResolvedValue(
      session({ status: 'completed', activeQuestionId: null }),
    );
    const report: EvaluationReport = {
      summary: 'Insufficient evidence.',
      overallScore: null,
      cues: [],
      competencyScores: {
        'vue-react': null,
        'ai-application': null,
        'system-design': null,
        'project-depth': 4,
      },
      strengths: [],
      gaps: [],
      nextPlan: [],
    };
    vi.mocked(api.getReport).mockResolvedValue(report);
    const store = useTrainingStore();

    await store.activate();

    expect(store.phase).toBe('report');
    expect(store.report?.overallScore).toBeNull();
    expect(store.currentQuestion).toBeNull();
  });

  it('recovers a pending analysis job after a refresh and keeps polling to completion', async () => {
    localStorage.setItem(storageKey, JSON.stringify({ jobId: 'job_1' }));
    vi.mocked(api.getJob).mockResolvedValueOnce(job()).mockResolvedValue(job('completed'));
    const store = useTrainingStore();

    await store.activate();
    await vi.advanceTimersByTimeAsync(2_000);

    expect(store.profileId).toBe('profile_1');
    expect(store.jobDescription).toBe('Authoritative server job description.');
    expect(store.analysisStatus).toBe('completed');
    expect(store.analysis).toEqual(analysis);
  });

  it('serializes job recovery reads across repeated mounts while an earlier read is pending', async () => {
    localStorage.setItem(storageKey, JSON.stringify({ jobId: 'job_1' }));
    const pending = deferred<JobRecord>();
    let activeRequests = 0;
    let maximumRequests = 0;
    let calls = 0;
    vi.mocked(api.getJob).mockImplementation(async () => {
      activeRequests += 1;
      maximumRequests = Math.max(maximumRequests, activeRequests);
      calls += 1;
      const result = calls === 1 ? await pending.promise : job('completed');
      activeRequests -= 1;
      return result;
    });
    const store = useTrainingStore();
    const firstMount = store.activate();
    store.deactivate();
    const secondMount = store.activate();
    pending.resolve(job());
    await Promise.all([firstMount, secondMount]);

    expect(maximumRequests).toBe(1);
    expect(store.analysisStatus).toBe('completed');
    expect(store.loading).toBe(false);
  });

  it('drops a missing session and falls back to the saved job', async () => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ sessionId: 'deleted_session', jobId: 'job_1' }),
    );
    vi.mocked(api.getInterviewSession).mockRejectedValue(
      new ApiClientError({ code: 404, status: 404, message: 'Not found', requestId: undefined }),
    );
    vi.mocked(api.getJob).mockResolvedValue(job('completed'));
    const store = useTrainingStore();

    await store.activate();

    expect(store.sessionId).toBe('');
    expect(store.phase).toBe('analysis');
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual({
      jobId: 'job_1',
      sessionId: '',
    });
  });

  it('ignores malformed saved identifiers and tolerates unavailable storage', async () => {
    localStorage.setItem(storageKey, '{bad json');
    const store = useTrainingStore();
    await store.activate();
    expect(store.phase).toBe('setup');
    expect(localStorage.getItem(storageKey)).toBeNull();
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('Denied');
      },
      removeItem: () => {
        throw new Error('Denied');
      },
    });
    store.restart();
    await store.activate();
    expect(store.phase).toBe('setup');
  });

  it('ignores a session recovery that finishes after restart', async () => {
    localStorage.setItem(storageKey, JSON.stringify({ sessionId: 'session_1' }));
    const slow = deferred<SessionRecord>();
    vi.mocked(api.getInterviewSession).mockReturnValue(slow.promise);
    const store = useTrainingStore();
    const recovery = store.activate();
    store.restart();
    slow.resolve(session());
    await recovery;
    expect(store.phase).toBe('setup');
    expect(store.sessionId).toBe('');
    expect(store.resumeText).toBe('');
  });

  it('keeps a completed session when only its report is unavailable', async () => {
    localStorage.setItem(storageKey, JSON.stringify({ sessionId: 'session_1', jobId: 'job_1' }));
    vi.mocked(api.getInterviewSession).mockResolvedValue(
      session({ status: 'completed', activeQuestionId: null }),
    );
    vi.mocked(api.getReport).mockRejectedValue(
      new ApiClientError({
        code: 404,
        status: 404,
        message: 'Report unavailable',
        requestId: undefined,
      }),
    );
    const store = useTrainingStore();

    await store.activate();

    expect(store.sessionId).toBe('session_1');
    expect(store.session?.status).toBe('completed');
    expect(store.currentQuestion).toBeNull();
    expect(store.errorMessage).toBe('Report unavailable');
  });

  it('does not overwrite a newer report with an older recovery response', async () => {
    localStorage.setItem(storageKey, JSON.stringify({ sessionId: 'session_1' }));
    vi.mocked(api.getInterviewSession).mockResolvedValue(
      session({ status: 'completed', activeQuestionId: null }),
    );
    const oldReport = deferred<EvaluationReport>();
    vi.mocked(api.getReport).mockReturnValue(oldReport.promise);
    const store = useTrainingStore();
    const recovery = store.activate();
    await settle();
    store.restart();
    const newReport: EvaluationReport = {
      summary: 'New report',
      overallScore: 80,
      competencyScores: {
        'vue-react': 4,
        'ai-application': 4,
        'system-design': 4,
        'project-depth': 4,
      },
      cues: [],
      strengths: [],
      gaps: [],
      nextPlan: [],
    };
    store.report = newReport;
    store.phase = 'report';
    oldReport.resolve({ ...newReport, summary: 'Old report' });
    await recovery;

    expect(store.report?.summary).toBe('New report');
  });

  it('does not resurrect preparation when a profile request finishes after restart', async () => {
    const store = useTrainingStore();
    await store.activate();
    store.resumeText = 'Candidate private resume text.';
    store.jobDescription = 'Job description';
    const slow = deferred<api.ProfileRecord>();
    vi.mocked(api.createProfile).mockReturnValue(slow.promise);
    const preparation = store.startPreparation();
    store.restart();
    slow.resolve({ id: 'profile_1', resumeText: 'Private', displayName: null });
    await preparation;

    expect(store.phase).toBe('setup');
    expect(store.profileId).toBe('');
    expect(api.analyzeJob).not.toHaveBeenCalled();
  });

  it('starts polling a newly submitted analysis and persists the job identifier', async () => {
    const store = useTrainingStore();
    await store.activate();
    store.profileId = 'profile_1';
    store.jobDescription = 'Job description';
    vi.mocked(api.analyzeJob).mockResolvedValue(job());
    vi.mocked(api.getJob).mockResolvedValue(job('completed'));

    await store.startPreparation();
    expect(store.phase).toBe('analysis');
    await vi.advanceTimersByTimeAsync(2_000);

    expect(store.analysisStatus).toBe('completed');
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual({
      jobId: 'job_1',
      sessionId: '',
    });
  });

  it.each(['startInterview', 'finishInterview', 'uploadResumeFile'] as const)(
    'ignores %s responses after route unmount',
    async (action) => {
      const store = useTrainingStore();
      store.applySession(session());
      await store.activate();
      const pending = deferred<never>();
      vi.mocked(api.createInterviewSession).mockReturnValue(pending.promise);
      vi.mocked(api.finishInterviewSession).mockReturnValue(pending.promise);
      vi.mocked(api.uploadResume).mockReturnValue(pending.promise);
      const request =
        action === 'uploadResumeFile'
          ? store.uploadResumeFile({ name: 'resume.pdf', size: 100 } as File)
          : store[action]();
      store.deactivate();
      pending.resolve(session({ id: 'stale_session' }) as never);
      await request;

      expect(store.sessionId).toBe('session_1');
      expect(store.report).toBeNull();
      expect(store.resumeUploadState).not.toBe('ready');
    },
  );
});
