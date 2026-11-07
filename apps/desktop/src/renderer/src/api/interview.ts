import type {
  AnswerSubmitInput,
  EvaluationReport,
  InterviewQuestion,
  InterviewSessionCreateInput,
  Difficulty,
  InterviewLanguage,
  InterviewRound,
  JobRecord,
  JobAnalyzeInput,
  ProfileInput,
  ResumeDocumentSummary,
  StoryInput,
  CoachingCue,
} from '@interview-assistant/contracts';
import { request, apiClient } from '../lib/http.js';
import {
  sessionHistoryPageSchema,
  sessionReviewSchema,
  type SessionHistoryQuery,
} from '@interview-assistant/contracts';

export async function getSessionHistory(query: SessionHistoryQuery) {
  return sessionHistoryPageSchema.parse(
    await request({ method: 'GET', url: '/interview-sessions', params: query }),
  );
}

export async function getSessionReview(sessionId: string) {
  return sessionReviewSchema.parse(
    await request({
      method: 'GET',
      url: `/interview-sessions/${encodeURIComponent(sessionId)}/review`,
    }),
  );
}

export type ProfileRecord = {
  id: string;
  resumeText: string;
  displayName: string | null;
  resumeSource?: 'file' | 'text';
  resumeDocument?: ResumeDocumentSummary | null;
};

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

export function createProfile(input: ProfileInput): Promise<ProfileRecord> {
  return request({ method: 'POST', url: '/profiles', data: input });
}

export function uploadResume(
  file: File,
  displayName?: string,
  onProgress?: (percentage: number) => void,
): Promise<ProfileRecord> {
  const formData = new FormData();
  formData.append('file', file);
  if (displayName?.trim()) {
    formData.append('displayName', displayName.trim());
  }

  return request(
    {
      method: 'POST',
      url: '/profiles/resume',
      data: formData,
      onUploadProgress: (event) => {
        if (event.total && onProgress) {
          onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
        }
      },
    },
    apiClient,
  );
}

export function analyzeJob(input: JobAnalyzeInput): Promise<JobRecord> {
  return request({ method: 'POST', url: '/jobs/analyze', data: input });
}

export function getJob(jobId: string): Promise<JobRecord> {
  return request({ method: 'GET', url: `/jobs/${jobId}` });
}

export function createStory(profileId: string, input: StoryInput) {
  return request({ method: 'POST', url: `/stories/${profileId}`, data: input });
}

export function createInterviewSession(input: InterviewSessionCreateInput): Promise<SessionRecord> {
  return request({ method: 'POST', url: '/interview-sessions', data: input });
}

export function submitAnswer(sessionId: string, input: AnswerSubmitInput): Promise<CoachingResult> {
  // CoachAgent and an optional InterviewerAgent call can each use 120 seconds.
  return request({
    method: 'POST',
    url: `/interview-sessions/${sessionId}/answers`,
    data: input,
    timeout: 300_000,
  });
}

export function finishInterviewSession(sessionId: string): Promise<EvaluationReport> {
  return request({ method: 'POST', url: `/interview-sessions/${sessionId}/finish` });
}

export function getInterviewSession(sessionId: string): Promise<SessionRecord> {
  return request({ method: 'GET', url: `/interview-sessions/${sessionId}` });
}

export function getReport(sessionId: string): Promise<EvaluationReport> {
  return request({ method: 'GET', url: `/reports/${sessionId}` });
}

export function controlSession(
  id: string,
  action: 'skip' | 'pause' | 'resume',
  questionId: string,
  version: number,
): Promise<SessionRecord> {
  return request({
    method: 'POST',
    url: '/interview-sessions/' + id + '/control',
    data: { action, questionId, version },
  });
}
