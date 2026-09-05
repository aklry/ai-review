import { ref } from 'vue';
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

export type Phase = 'setup' | 'analysis' | 'interview' | 'report';

const defaultTargetRole = 'AI Frontend Engineer';
const defaultInterviewLanguage: InterviewLanguage = 'zh-CN';
const defaultInterviewRound: InterviewRound = 'technical';
const defaultInterviewDifficulty: Difficulty = 'l2';
const defaultQuestionCount = 8;

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

  function restart(): void {
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
    restart,
  };
});
