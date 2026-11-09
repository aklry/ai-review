import type { AxiosRequestConfig } from 'axios';
import { createSessionApi, createWorkflowApi } from '@interview-assistant/api-client';
export type { ProfileRecord, SessionRecord, CoachingResult } from '@interview-assistant/api-client';
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

const workflowRequest = <T>(config: AxiosRequestConfig) => request<T>(config, apiClient);

export const {
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
} = createWorkflowApi(workflowRequest);
