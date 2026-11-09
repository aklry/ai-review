import type { AxiosRequestConfig } from 'axios';
import {
  interviewLanguageSchema,
  jobRecordSchema,
  practiceTaskSchema,
  speechTranscriptionSchema,
  uploadedProfileSchema,
  type InterviewLanguage,
  type InterviewSessionCreateInput,
  type JobAnalyzeInput,
  type JobRecord,
  type ProfileInput,
  type ResumeDocumentSummary,
  type StoryInput,
  type UploadedProfile,
  type PracticeTaskView,
} from '@interview-assistant/contracts';
import type { SessionRecord } from './sessions.js';

export type ProfileRecord = {
  id: string;
  resumeText: string;
  displayName: string | null;
  resumeSource?: 'file' | 'text';
  resumeDocument?: ResumeDocumentSummary | null;
};

export function createWorkflowApi(request: <T>(config: AxiosRequestConfig) => Promise<T>) {
  async function createProfile(input: ProfileInput): Promise<ProfileRecord> {
    return request({ method: 'POST', url: '/profiles', data: input });
  }

  async function uploadResume(
    file: File,
    displayName?: string,
    onProgress?: (percentage: number) => void,
  ): Promise<ProfileRecord> {
    const formData = new FormData();
    formData.append('file', file);
    if (displayName?.trim()) formData.append('displayName', displayName.trim());

    const profile = await request<unknown>({
      method: 'POST',
      url: '/profiles/resume',
      data: formData,
      onUploadProgress: (event) => {
        if (event.total && onProgress) {
          onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
        }
      },
    });
    return uploadedProfileSchema.parse(profile) satisfies UploadedProfile;
  }

  async function analyzeJob(input: JobAnalyzeInput): Promise<JobRecord> {
    return jobRecordSchema.parse(
      await request<unknown>({ method: 'POST', url: '/jobs/analyze', data: input }),
    );
  }

  async function getJob(jobId: string): Promise<JobRecord> {
    return jobRecordSchema.parse(
      await request<unknown>({ method: 'GET', url: `/jobs/${encodeURIComponent(jobId)}` }),
    );
  }

  function createStory(profileId: string, input: StoryInput): Promise<unknown> {
    return request({
      method: 'POST',
      url: `/stories/${encodeURIComponent(profileId)}`,
      data: input,
    });
  }

  function createInterviewSession(input: InterviewSessionCreateInput): Promise<SessionRecord> {
    return request({ method: 'POST', url: '/interview-sessions', data: input });
  }

  async function startPractice(questionId: string, criterionId: string): Promise<PracticeTaskView> {
    return practiceTaskSchema.parse(
      await request<unknown>({
        method: 'POST',
        url: `/questions/${encodeURIComponent(questionId)}/practice`,
        data: { criterionId },
      }),
    );
  }

  async function submitPracticeAnswer(
    taskId: string,
    stage: number,
    answerText: string,
  ): Promise<PracticeTaskView> {
    return practiceTaskSchema.parse(
      await request<unknown>({
        method: 'POST',
        url: `/practice/${encodeURIComponent(taskId)}/answers`,
        data: { stage, answerText },
        timeout: 300_000,
      }),
    );
  }

  function markReferenceViewed(questionId: string): Promise<unknown> {
    return request({
      method: 'POST',
      url: `/questions/${encodeURIComponent(questionId)}/reference-view`,
    });
  }

  function submitScoreDispute(questionId: string, reason: string): Promise<unknown> {
    return request({
      method: 'POST',
      url: `/questions/${encodeURIComponent(questionId)}/score-dispute`,
      data: { reason },
    });
  }

  async function transcribeAudio(
    file: Blob,
    language: InterviewLanguage,
  ): Promise<{ text: string }> {
    interviewLanguageSchema.parse(language);
    const formData = new FormData();
    formData.append('file', file, 'answer.wav');
    formData.append('language', language);
    return speechTranscriptionSchema.parse(
      await request<unknown>({
        method: 'POST',
        url: '/speech/transcriptions',
        data: formData,
        timeout: 180_000,
      }),
    );
  }

  return {
    createProfile,
    uploadResume,
    analyzeJob,
    getJob,
    createStory,
    createInterviewSession,
    startPractice,
    submitPracticeAnswer,
    markReferenceViewed,
    submitScoreDispute,
    transcribeAudio,
  };
}
