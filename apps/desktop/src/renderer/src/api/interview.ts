import type {
  InterviewSessionCreateInput,
  JobRecord,
  JobAnalyzeInput,
  ProfileInput,
  ResumeDocumentSummary,
  StoryInput,
} from '@interview-assistant/contracts';
import { createSessionApi, type SessionRecord } from '@interview-assistant/api-client';
export type { SessionRecord, CoachingResult } from '@interview-assistant/api-client';
import { request, apiClient } from '../lib/http.js';

export const {
  getSessionHistory,
  getSessionReview,
  getInterviewSession,
  submitAnswer,
  controlSession,
  finishInterviewSession,
  getReport,
} = createSessionApi(request);

export type ProfileRecord = {
  id: string;
  resumeText: string;
  displayName: string | null;
  resumeSource?: 'file' | 'text';
  resumeDocument?: ResumeDocumentSummary | null;
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
