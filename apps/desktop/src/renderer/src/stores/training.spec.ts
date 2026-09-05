import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { JobAnalysis } from '@interview-assistant/contracts';
import { useTrainingStore } from './training.js';

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
    setActivePinia(createPinia());
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
});
