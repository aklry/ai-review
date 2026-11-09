import type { AxiosRequestConfig } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import type { ApiResponse } from '@interview-assistant/contracts';
import { createWorkflowApi } from './workflows.js';

function requester(responses: unknown[] = []) {
  const configs: AxiosRequestConfig[] = [];
  const request = vi.fn(async (config: AxiosRequestConfig) => {
    configs.push(config);
    return responses.shift();
  });
  return {
    configs,
    api: createWorkflowApi(request as <T>(config: AxiosRequestConfig) => Promise<T>),
  };
}

const job = {
  id: 'job_1',
  profileId: 'profile_1',
  targetRole: 'Frontend engineer',
  company: null,
  description: 'A role requiring frontend application development.',
  analysis: null,
  analysisStatus: 'pending',
  analysisError: null,
};

const uploadedProfile = {
  id: 'profile_1',
  resumeText: 'Experienced frontend engineer with measurable results.',
  displayName: 'Ada Lovelace',
  resumeSource: 'file',
  resumeDocument: null,
};

describe('workflow API', () => {
  it('creates a profile with the existing profile payload', async () => {
    const input = {
      resumeText: 'Experienced frontend engineer with measurable results.',
      displayName: 'Ada Lovelace',
    };
    const profile = { id: 'profile_1', ...input };
    const { api, configs } = requester([profile]);

    await expect(api.createProfile(input)).resolves.toEqual(profile);

    expect(configs[0]).toMatchObject({ method: 'POST', url: '/profiles', data: input });
  });

  it('validates job results and encodes identifiers in job and story paths', async () => {
    const { api, configs } = requester([job, job, { id: 'story_1' }, {}]);

    await expect(
      api.analyzeJob({
        profileId: 'profile_1',
        targetRole: 'Frontend engineer',
        jobDescription: 'A role requiring frontend application development.',
      }),
    ).resolves.toEqual(job);
    await expect(api.getJob('job/a b')).resolves.toEqual(job);
    const story = {
      title: 'Launch',
      project: 'Web app',
      situation: 'The app was slow.',
      task: 'Improve loading.',
      action: 'Split the bundle.',
      result: 'Loading became faster.',
      metrics: [],
    };
    await api.createStory('profile/a b', story);

    expect(configs.map(({ method, url }) => [method, url])).toEqual([
      ['POST', '/jobs/analyze'],
      ['GET', '/jobs/job%2Fa%20b'],
      ['POST', '/stories/profile%2Fa%20b'],
    ]);
    expect(configs[0]?.data).toEqual({
      profileId: 'profile_1',
      targetRole: 'Frontend engineer',
      jobDescription: 'A role requiring frontend application development.',
    });
    expect(configs[2]?.data).toEqual(story);

    const invalid = requester([{ id: 'broken' }]);
    await expect(invalid.api.getJob('job_1')).rejects.toThrow();
  });

  it('uploads the file and normalized display name and reports bounded progress', async () => {
    const { api, configs } = requester([uploadedProfile]);
    const progress = vi.fn();
    const file = new File(['resume'], 'resume.pdf', { type: 'application/pdf' });

    await expect(api.uploadResume(file, '  Ada Lovelace  ', progress)).resolves.toEqual(
      uploadedProfile,
    );

    const config = configs[0]!;
    expect(config.method).toBe('POST');
    expect(config.url).toBe('/profiles/resume');
    expect(config.data).toBeInstanceOf(FormData);
    expect((config.data as FormData).get('file')).toBe(file);
    expect((config.data as FormData).get('displayName')).toBe('Ada Lovelace');
    config.onUploadProgress?.({ loaded: 12, total: 10 } as never);
    expect(progress).toHaveBeenCalledWith(100);
  });

  it('preserves session inputs and validates practice stage requests and results', async () => {
    const session = { id: 'session_1' };
    const { api, configs } = requester([session, {}, {}]);
    const input = {
      profileId: 'profile_1',
      jobId: 'job_1',
      language: 'zh-CN' as const,
      round: 'technical' as const,
      difficulty: 'l2' as const,
      questionCount: 6,
    };

    await expect(api.createInterviewSession(input)).resolves.toEqual(session);
    await expect(api.startPractice('question/1', 'criterion 2')).rejects.toThrow();
    await expect(api.submitPracticeAnswer('task/1', 2, 'A complete answer.')).rejects.toThrow();

    expect(
      configs.map(({ method, url, data, timeout }) => ({ method, url, data, timeout })),
    ).toEqual([
      { method: 'POST', url: '/interview-sessions', data: input, timeout: undefined },
      {
        method: 'POST',
        url: '/questions/question%2F1/practice',
        data: { criterionId: 'criterion 2' },
        timeout: undefined,
      },
      {
        method: 'POST',
        url: '/practice/task%2F1/answers',
        data: { stage: 2, answerText: 'A complete answer.' },
        timeout: 300_000,
      },
    ]);
  });

  it('sends question review actions to their encoded endpoints', async () => {
    const { api, configs } = requester([{ recorded: true }, { saved: true }]);

    await api.markReferenceViewed('question/one');
    await api.submitScoreDispute('question/one', 'The answer included another example.');

    expect(configs.map(({ method, url, data }) => ({ method, url, data }))).toEqual([
      { method: 'POST', url: '/questions/question%2Fone/reference-view', data: undefined },
      {
        method: 'POST',
        url: '/questions/question%2Fone/score-dispute',
        data: { reason: 'The answer included another example.' },
      },
    ]);
  });

  it('uploads audio with language and rejects malformed transcription results', async () => {
    const response: ApiResponse<{ text: string }> = {
      code: 0,
      message: 'ok',
      data: { text: '  recognized words  ' },
      requestId: 'req_1',
      timestamp: '2026-11-08T00:00:00.000Z',
    };
    const { api, configs } = requester([response.data]);
    const file = new File(['wav data'], 'answer.wav', { type: 'audio/wav' });

    await expect(api.transcribeAudio(file, 'en-US')).resolves.toEqual({
      text: 'recognized words',
    });

    const config = configs[0]!;
    expect(config.method).toBe('POST');
    expect(config.url).toBe('/speech/transcriptions');
    expect(config.timeout).toBe(180_000);
    expect(config.data).toBeInstanceOf(FormData);
    const uploadedFile = (config.data as FormData).get('file') as File;
    expect(uploadedFile.name).toBe('answer.wav');
    expect(uploadedFile.type).toBe('audio/wav');
    expect(await uploadedFile.text()).toBe('wav data');
    expect((config.data as FormData).get('language')).toBe('en-US');

    const invalid = requester([{ text: '   ' }]);
    await expect(invalid.api.transcribeAudio(file, 'mixed')).rejects.toThrow();
  });
});
