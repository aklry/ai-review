import { computed, onScopeDispose, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import type {
  Difficulty,
  EvaluationReport,
  InterviewLanguage,
  InterviewQuestion,
  InterviewRound,
  StoryInput,
  JobAnalysis,
  JobRecord,
} from '@interview-assistant/contracts';
import type { CoachingResult, ProfileRecord, SessionRecord } from '../api/interview.js';
import * as api from '../api/interview.js';
import { ApiClientError } from '../lib/http.js';

export type Phase = 'setup' | 'analysis' | 'interview' | 'report';

const defaultTargetRole = 'AI Frontend Engineer';
const defaultInterviewLanguage: InterviewLanguage = 'zh-CN';
const defaultInterviewRound: InterviewRound = 'technical';
const defaultInterviewDifficulty: Difficulty = 'l2';
const defaultQuestionCount = 8;
const storageKey = 'interview-assistant.training.v1';
const analysisPollingIntervalMs = 2000;

type RecoveryIds = { jobId: string; sessionId: string };

function readRecoveryIds(): RecoveryIds {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
    if (typeof saved !== 'object' || saved === null || Array.isArray(saved))
      throw new Error('Invalid recovery state');
    const candidate = saved as Record<string, unknown>;
    const identifier = (value: unknown): string => {
      if (value === undefined || value === '') return '';
      if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value))
        throw new Error('Invalid identifier');
      return value;
    };
    return { jobId: identifier(candidate.jobId), sessionId: identifier(candidate.sessionId) };
  } catch {
    saveRecoveryIds({ jobId: '', sessionId: '' });
    return { jobId: '', sessionId: '' };
  }
}

function saveRecoveryIds(ids: RecoveryIds): void {
  try {
    if (ids.jobId || ids.sessionId) localStorage.setItem(storageKey, JSON.stringify(ids));
    else localStorage.removeItem(storageKey);
  } catch {
    // Recovery is optional when browser storage is unavailable.
  }
}

function createEmptyStoryDraft(): StoryInput {
  return {
    title: '',
    project: '',
    situation: '',
    task: '',
    action: '',
    result: '',
    metrics: [],
  };
}

export const useTrainingStore = defineStore('training', () => {
  const phase = ref<Phase>('setup');
  const loading = ref(false);
  const errorMessage = ref('');
  const profileId = ref('');
  const jobId = ref('');
  const sessionId = ref('');
  const profileName = ref('');
  const resumeText = ref('');
  const resumeFileName = ref('');
  const resumeUploadState = ref<'idle' | 'uploading' | 'ready' | 'error'>('idle');
  const resumeUploadProgress = ref(0);
  const resumeDocument = ref<ProfileRecord['resumeDocument']>(null);
  const manualResumeMode = ref(false);
  const targetRole = ref(defaultTargetRole);
  const company = ref('');
  const jobDescription = ref('');
  const interviewLanguage = ref<InterviewLanguage>(defaultInterviewLanguage);
  const interviewRound = ref<InterviewRound>(defaultInterviewRound);
  const interviewDifficulty = ref<Difficulty>(defaultInterviewDifficulty);
  const questionCount = ref(defaultQuestionCount);
  const stories = ref<StoryInput[]>([]);
  const storyDraft = ref<StoryInput>(createEmptyStoryDraft());
  const storyMetricsText = ref('');
  const currentQuestion = ref<InterviewQuestion | null>(null);
  const currentQuestionIndex = ref(0);
  const answerText = ref('');
  const latestCue = ref<CoachingResult['cue'] | null>(null);
  const analysis = ref<JobAnalysis | null>(null);
  const analysisStatus = ref<JobRecord['analysisStatus']>('pending');
  const analysisError = ref<string | null>(null);
  const analysisJobId = ref('');
  const report = ref<EvaluationReport | null>(null);
  const modelState = ref<{ model: string; degraded: boolean } | null>(null);
  const session = ref<SessionRecord | null>(null);

  let active = false;
  let generation = 0;
  let pollHandle: ReturnType<typeof setTimeout> | null = null;
  let pollInFlight = false;
  let jobRequest: Promise<JobRecord> | null = null;
  const sessionMutations = new Map<string, Promise<unknown>>();

  const answersComplete = computed(() => Boolean(session.value && !currentQuestion.value));
  const canSubmitAnswer = computed(() =>
    Boolean(
      sessionId.value &&
      session.value?.status === 'active' &&
      currentQuestion.value &&
      answerText.value.trim() &&
      !loading.value,
    ),
  );
  const baseQuestionCount = computed(
    () =>
      session.value?.questions.filter((question) => !question.parentQuestionId).length ??
      questionCount.value,
  );

  watch(
    [jobId, sessionId],
    () => saveRecoveryIds({ jobId: jobId.value, sessionId: sessionId.value }),
    { flush: 'sync' },
  );

  function isCurrent(requestGeneration: number): boolean {
    return active && generation === requestGeneration;
  }

  function showError(error: unknown): void {
    errorMessage.value =
      error instanceof ApiClientError
        ? error.message
        : '请求失败，请检查 API、PostgreSQL 和 DeepSeek 配置';
  }

  function clearPollTimer(): void {
    if (pollHandle !== null) clearTimeout(pollHandle);
    pollHandle = null;
  }

  function canPoll(): boolean {
    return (
      active &&
      phase.value === 'analysis' &&
      !loading.value &&
      Boolean(analysisJobId.value) &&
      (analysisStatus.value === 'pending' || analysisStatus.value === 'processing')
    );
  }

  function schedulePoll(delay = analysisPollingIntervalMs): void {
    if (!canPoll() || pollInFlight || pollHandle !== null) return;
    pollHandle = setTimeout(() => {
      pollHandle = null;
      void pollAnalysisOnce();
    }, delay);
  }

  function applyJob(job: JobRecord): void {
    profileId.value = job.profileId;
    jobId.value = job.id;
    analysisJobId.value = job.id;
    targetRole.value = job.targetRole;
    company.value = job.company ?? '';
    jobDescription.value = job.description;
    analysis.value = job.analysis;
    analysisStatus.value = job.analysisStatus;
    analysisError.value = job.analysisError;
    errorMessage.value =
      job.analysisStatus === 'failed' ? (job.analysisError ?? '岗位分析失败') : '';
  }

  async function readJob(id: string, canRead: () => boolean): Promise<JobRecord | null> {
    while (jobRequest) {
      // The previous owner handles its own failure; a remount only waits its turn.
      await jobRequest.catch(() => undefined);
      if (!canRead()) return null;
    }
    if (!canRead()) return null;
    const request = api.getJob(id);
    jobRequest = request;
    try {
      return await request;
    } finally {
      if (jobRequest === request) jobRequest = null;
    }
  }

  async function pollAnalysisOnce(): Promise<void> {
    if (!canPoll() || pollInFlight) return;
    const requestGeneration = generation;
    const requestedJobId = analysisJobId.value;
    const stillCurrent = () =>
      isCurrent(requestGeneration) && canPoll() && analysisJobId.value === requestedJobId;
    pollInFlight = true;
    try {
      const job = await readJob(requestedJobId, stillCurrent);
      if (job && stillCurrent()) applyJob(job);
    } catch (error) {
      if (stillCurrent()) {
        showError(error);
        if (error instanceof ApiClientError && error.status === 404) {
          jobId.value = analysisJobId.value = '';
          phase.value = 'setup';
        }
      }
    } finally {
      pollInFlight = false;
      if (canPoll()) {
        // A remount/restart waits for the old request, then reads the current job.
        if (requestGeneration !== generation || requestedJobId !== analysisJobId.value)
          void pollAnalysisOnce();
        else schedulePoll();
      }
    }
  }

  watch(
    [phase, analysisJobId, analysisStatus, loading],
    () => {
      clearPollTimer();
      schedulePoll();
    },
    { flush: 'sync' },
  );

  function applySession(loaded: SessionRecord): void {
    session.value = loaded;
    sessionId.value = loaded.id;
    profileId.value = loaded.plan.profileId;
    jobId.value = loaded.plan.jobId;
    resumeText.value = loaded.plan.profile.resumeText;
    profileName.value = loaded.plan.profile.displayName ?? '';
    targetRole.value = loaded.plan.job.targetRole;
    company.value = loaded.plan.job.company ?? '';
    jobDescription.value = loaded.plan.job.description;
    analysis.value = loaded.plan.job.analysis;
    analysisStatus.value = loaded.plan.job.analysisStatus;
    analysisJobId.value = loaded.plan.jobId;
    interviewLanguage.value = loaded.plan.language;
    interviewRound.value = loaded.plan.round;
    interviewDifficulty.value = loaded.plan.difficulty;
    currentQuestionIndex.value = loaded.currentQuestionIndex;
    currentQuestion.value =
      loaded.status === 'active' && loaded.activeQuestionId
        ? (loaded.questions.find((question) => question.id === loaded.activeQuestionId) ?? null)
        : null;
    answerText.value = '';
    latestCue.value = null;
    modelState.value = null;
    phase.value = 'interview';
  }

  async function activate(requestedSessionId?: string): Promise<void> {
    if (active) {
      if (!requestedSessionId || requestedSessionId === sessionId.value) return;
      deactivate();
    }
    if (requestedSessionId && requestedSessionId !== sessionId.value) restart();
    active = true;
    const requestGeneration = generation;
    const saved = readRecoveryIds();
    const savedSessionId = requestedSessionId || sessionId.value || saved.sessionId;
    const savedJobId = requestedSessionId ? '' : jobId.value || saved.jobId;
    if (!savedSessionId && (phase.value !== 'setup' || !savedJobId)) {
      schedulePoll(0);
      return;
    }

    loading.value = true;
    errorMessage.value = '';
    try {
      if (savedSessionId) {
        // A route remount must read after its outstanding write commits, rather
        // than restore an old cursor and discard the late mutation response.
        const pendingMutation = sessionMutations.get(savedSessionId);
        if (pendingMutation) {
          await pendingMutation.catch(() => undefined);
          if (!isCurrent(requestGeneration)) return;
        }
        let restored: SessionRecord | null = null;
        try {
          restored = await api.getInterviewSession(savedSessionId);
        } catch (error) {
          if (!isCurrent(requestGeneration)) return;
          if (!(error instanceof ApiClientError) || error.status !== 404) throw error;
          sessionId.value = '';
          session.value = null;
          currentQuestion.value = null;
          saveRecoveryIds({ jobId: savedJobId, sessionId: '' });
          if (requestedSessionId) {
            phase.value = 'setup';
            errorMessage.value = '指定训练记录已不存在，请从历史记录重新选择';
            return;
          }
        }
        if (!isCurrent(requestGeneration)) return;
        if (restored) {
          applySession(restored);
          if (restored.status === 'completed') {
            const restoredReport = await api.getReport(restored.id);
            if (!isCurrent(requestGeneration)) return;
            report.value = restoredReport;
            phase.value = 'report';
          }
          return;
        }
      }
      if (savedJobId) {
        try {
          const restored = await readJob(savedJobId, () => isCurrent(requestGeneration));
          if (!isCurrent(requestGeneration) || !restored) return;
          applyJob(restored);
          phase.value = 'analysis';
        } catch (error) {
          if (!isCurrent(requestGeneration)) return;
          if (!(error instanceof ApiClientError) || error.status !== 404) throw error;
          jobId.value = analysisJobId.value = '';
          phase.value = 'setup';
          saveRecoveryIds({ jobId: '', sessionId: '' });
          errorMessage.value = '之前的训练记录已不存在，请重新开始';
        }
      } else if (!session.value) {
        phase.value = 'setup';
        errorMessage.value = '之前的训练记录已不存在，请重新开始';
      }
    } catch (error) {
      if (isCurrent(requestGeneration)) showError(error);
    } finally {
      if (isCurrent(requestGeneration)) {
        loading.value = false;
        schedulePoll();
      }
    }
  }

  function deactivate(): void {
    active = false;
    generation += 1;
    clearPollTimer();
    loading.value = false;
  }

  async function mutateSession<T>(id: string, request: () => Promise<T>): Promise<T> {
    const pending = request();
    sessionMutations.set(id, pending);
    try {
      return await pending;
    } finally {
      if (sessionMutations.get(id) === pending) sessionMutations.delete(id);
    }
  }

  async function sendAnswer(): Promise<void> {
    if (!active || !canSubmitAnswer.value || !currentQuestion.value) return;
    const requestGeneration = generation;
    const requestedSessionId = sessionId.value;
    const questionId = currentQuestion.value.id;
    errorMessage.value = '';
    loading.value = true;
    try {
      const result = await mutateSession(requestedSessionId, () =>
        api.submitAnswer(requestedSessionId, {
          questionId,
          answerText: answerText.value,
        }),
      );
      if (!isCurrent(requestGeneration) || sessionId.value !== requestedSessionId) return;
      latestCue.value = result.cue;
      modelState.value = { model: result.model, degraded: result.degraded };
      answerText.value = '';
      currentQuestionIndex.value = result.currentQuestionIndex;
      currentQuestion.value = result.nextQuestion;
      if (session.value) {
        session.value.status = result.status;
        session.value.activeQuestionId = result.activeQuestionId;
        session.value.currentQuestionIndex = result.currentQuestionIndex;
        if (
          result.nextQuestion &&
          !session.value.questions.some((question) => question.id === result.nextQuestion?.id)
        ) {
          session.value.questions.push(result.nextQuestion);
        }
      }
    } catch (error) {
      if (isCurrent(requestGeneration)) showError(error);
    } finally {
      if (isCurrent(requestGeneration)) loading.value = false;
    }
  }

  async function startPreparation(): Promise<void> {
    if (!active || loading.value) return;
    generation += 1;
    const requestGeneration = generation;
    clearPollTimer();
    errorMessage.value = '';
    loading.value = true;
    analysis.value = null;
    analysisError.value = null;
    analysisStatus.value = 'pending';
    jobId.value = analysisJobId.value = sessionId.value = '';
    session.value = null;
    currentQuestion.value = null;
    report.value = null;
    try {
      let activeProfileId = profileId.value;
      if (!activeProfileId) {
        const profile = await api.createProfile({
          resumeText: resumeText.value,
          ...(profileName.value.trim() ? { displayName: profileName.value } : {}),
        });
        if (!isCurrent(requestGeneration)) return;
        activeProfileId = profile.id;
        profileId.value = profile.id;
      }
      for (const story of stories.value) {
        await api.createStory(activeProfileId, story);
        if (!isCurrent(requestGeneration)) return;
      }
      const job = await api.analyzeJob({
        profileId: activeProfileId,
        targetRole: targetRole.value,
        ...(company.value.trim() ? { company: company.value } : {}),
        jobDescription: jobDescription.value,
      });
      if (!isCurrent(requestGeneration)) return;
      applyJob(job);
      phase.value = 'analysis';
    } catch (error) {
      if (isCurrent(requestGeneration)) showError(error);
    } finally {
      if (isCurrent(requestGeneration)) loading.value = false;
    }
  }

  async function startInterview(): Promise<void> {
    if (!active || loading.value || !profileId.value || !jobId.value) return;
    const requestGeneration = generation;
    errorMessage.value = '';
    loading.value = true;
    try {
      const created = await api.createInterviewSession({
        profileId: profileId.value,
        jobId: jobId.value,
        language: interviewLanguage.value,
        round: interviewRound.value,
        difficulty: interviewDifficulty.value,
        questionCount: questionCount.value,
      });
      if (isCurrent(requestGeneration)) applySession(created);
    } catch (error) {
      if (isCurrent(requestGeneration)) showError(error);
    } finally {
      if (isCurrent(requestGeneration)) loading.value = false;
    }
  }

  async function finishInterview(): Promise<void> {
    if (!active || loading.value || !sessionId.value) return;
    const requestGeneration = generation;
    const requestedSessionId = sessionId.value;
    errorMessage.value = '';
    loading.value = true;
    try {
      const finishedReport = await mutateSession(requestedSessionId, () =>
        api.finishInterviewSession(requestedSessionId),
      );
      if (!isCurrent(requestGeneration) || sessionId.value !== requestedSessionId) return;
      report.value = finishedReport;
      if (session.value) {
        session.value.status = 'completed';
        session.value.activeQuestionId = null;
      }
      currentQuestion.value = null;
      answerText.value = '';
      phase.value = 'report';
    } catch (error) {
      if (isCurrent(requestGeneration)) showError(error);
    } finally {
      if (isCurrent(requestGeneration)) loading.value = false;
    }
  }

  async function uploadResumeFile(file: File): Promise<void> {
    if (!active || loading.value) return;
    const requestGeneration = generation;
    profileId.value = '';
    resumeText.value = '';
    resumeFileName.value = '';
    resumeDocument.value = null;
    resumeUploadProgress.value = 0;
    manualResumeMode.value = false;
    const extension = file.name.toLowerCase().split('.').pop();
    if (extension !== 'pdf' && extension !== 'docx') {
      resumeUploadState.value = 'error';
      errorMessage.value =
        extension === 'doc'
          ? '暂不支持旧版 DOC 文件，请另存为 DOCX 或 PDF 后重新上传'
          : '仅支持 PDF 或 DOCX 简历文件';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      resumeUploadState.value = 'error';
      errorMessage.value = '简历文件不能超过 10 MB';
      return;
    }
    errorMessage.value = '';
    loading.value = true;
    resumeUploadState.value = 'uploading';
    try {
      const profile = await api.uploadResume(file, profileName.value, (percentage) => {
        if (isCurrent(requestGeneration)) resumeUploadProgress.value = percentage;
      });
      if (!isCurrent(requestGeneration)) return;
      profileId.value = profile.id;
      resumeText.value = profile.resumeText;
      resumeFileName.value = file.name;
      resumeDocument.value = profile.resumeDocument ?? null;
      resumeUploadState.value = 'ready';
      resumeUploadProgress.value = 100;
    } catch (error) {
      if (isCurrent(requestGeneration)) {
        resumeUploadState.value = 'error';
        showError(error);
      }
    } finally {
      if (isCurrent(requestGeneration)) loading.value = false;
    }
  }

  onScopeDispose(deactivate);

  function restart(): void {
    generation += 1;
    clearPollTimer();
    phase.value = 'setup';
    loading.value = false;
    errorMessage.value = '';
    profileId.value = '';
    jobId.value = '';
    sessionId.value = '';
    profileName.value = '';
    resumeText.value = '';
    resumeFileName.value = '';
    resumeUploadState.value = 'idle';
    resumeUploadProgress.value = 0;
    resumeDocument.value = null;
    manualResumeMode.value = false;
    targetRole.value = defaultTargetRole;
    company.value = '';
    jobDescription.value = '';
    interviewLanguage.value = defaultInterviewLanguage;
    interviewRound.value = defaultInterviewRound;
    interviewDifficulty.value = defaultInterviewDifficulty;
    questionCount.value = defaultQuestionCount;
    stories.value = [];
    storyDraft.value = createEmptyStoryDraft();
    storyMetricsText.value = '';
    currentQuestion.value = null;
    currentQuestionIndex.value = 0;
    answerText.value = '';
    latestCue.value = null;
    analysis.value = null;
    analysisStatus.value = 'pending';
    analysisError.value = null;
    analysisJobId.value = '';
    report.value = null;
    modelState.value = null;
    session.value = null;
    saveRecoveryIds({ jobId: '', sessionId: '' });
  }

  return {
    phase,
    loading,
    errorMessage,
    profileId,
    jobId,
    sessionId,
    profileName,
    resumeText,
    resumeFileName,
    resumeUploadState,
    resumeUploadProgress,
    resumeDocument,
    manualResumeMode,
    targetRole,
    company,
    jobDescription,
    interviewLanguage,
    interviewRound,
    interviewDifficulty,
    questionCount,
    stories,
    storyDraft,
    storyMetricsText,
    currentQuestion,
    currentQuestionIndex,
    answerText,
    latestCue,
    analysis,
    analysisStatus,
    analysisError,
    analysisJobId,
    report,
    modelState,
    session,
    answersComplete,
    canSubmitAnswer,
    baseQuestionCount,
    activate,
    deactivate,
    applyJob,
    applySession,
    sendAnswer,
    startPreparation,
    startInterview,
    finishInterview,
    uploadResumeFile,
    restart,
  };
});
