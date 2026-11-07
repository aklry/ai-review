import type { AxiosRequestConfig } from 'axios';
import {
  sessionHistoryPageSchema,
  sessionReviewSchema,
  type AnswerSubmitInput,
  type SessionHistoryQuery,
  type InterviewQuestion,
  type InterviewLanguage,
  type InterviewRound,
  type Difficulty,
  type JobRecord,
  type CoachingCue,
  type EvaluationReport,
} from '@interview-assistant/contracts';

export type SessionRecord = {
  feedbackPolicy?: 'immediate' | 'deferred';
  pausedAt?: string | null;
  deadlineAt?: string | null;
  id: string;
  status: string;
  currentQuestionIndex: number;
  activeQuestionId: string | null;
  version: number;
  questions: Array<InterviewQuestion & { answer?: unknown }>;
  plan: {
    profileId: string;
    jobId: string;
    language: InterviewLanguage;
    round: InterviewRound;
    difficulty: Difficulty;
    profile: { resumeText: string; displayName?: string | null };
    job: Pick<JobRecord, 'targetRole' | 'company' | 'description' | 'analysis' | 'analysisStatus'>;
  };
};

export type CoachingResult = {
  cue: CoachingCue | null;
  nextQuestion: InterviewQuestion | null;
  currentQuestionIndex: number;
  activeQuestionId: string | null;
  status: string;
  degraded: boolean;
  model: string;
};

export function createSessionApi(request: <T>(config: AxiosRequestConfig) => Promise<T>) {
  async function getSessionHistory(query: SessionHistoryQuery) {
    return sessionHistoryPageSchema.parse(
      await request({ method: 'GET', url: '/interview-sessions', params: query }),
    );
  }

  async function getSessionReview(sessionId: string) {
    return sessionReviewSchema.parse(
      await request({
        method: 'GET',
        url: `/interview-sessions/${encodeURIComponent(sessionId)}/review`,
      }),
    );
  }

  function submitAnswer(sessionId: string, input: AnswerSubmitInput): Promise<CoachingResult> {
    // CoachAgent and an optional InterviewerAgent call can each use 120 seconds.
    return request({
      method: 'POST',
      url: `/interview-sessions/${encodeURIComponent(sessionId)}/answers`,
      data: input,
      timeout: 300_000,
    });
  }

  function finishInterviewSession(sessionId: string): Promise<EvaluationReport> {
    return request({
      method: 'POST',
      url: `/interview-sessions/${encodeURIComponent(sessionId)}/finish`,
    });
  }

  function getInterviewSession(sessionId: string): Promise<SessionRecord> {
    return request({ method: 'GET', url: `/interview-sessions/${encodeURIComponent(sessionId)}` });
  }

  function getReport(sessionId: string): Promise<EvaluationReport> {
    return request({ method: 'GET', url: `/reports/${encodeURIComponent(sessionId)}` });
  }

  function controlSession(
    id: string,
    action: 'skip' | 'pause' | 'resume',
    questionId: string,
    version: number,
  ): Promise<SessionRecord> {
    return request({
      method: 'POST',
      url: '/interview-sessions/' + encodeURIComponent(id) + '/control',
      data: { action, questionId, version },
    });
  }
  return {
    getSessionHistory,
    getSessionReview,
    getInterviewSession,
    submitAnswer,
    controlSession,
    finishInterviewSession,
    getReport,
  };
}
