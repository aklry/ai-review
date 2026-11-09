import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { api } from './connection';
import { usePreparation } from './preparation';
import type { JobRecord } from '@interview-assistant/contracts';

vi.mock('./connection', () => ({
  address: 'https://example.test/api',
  message: (e: Error) => e.message,
  api: {
    createProfile: vi.fn(),
    uploadResume: vi.fn(),
    analyzeJob: vi.fn(),
    getJob: vi.fn(),
    createStory: vi.fn(),
    createInterviewSession: vi.fn(),
  },
}));
const job: JobRecord = {
  id: 'job1',
  profileId: 'profile1',
  targetRole: '前端工程师',
  company: null,
  description: '一段足够长的岗位介绍，需要掌握前端工程和相关系统开发',
  analysisStatus: 'completed',
  analysisError: null,
  analysis: {
    summary: '关注工程能力',
    competencies: [
      {
        competency: 'vue-react',
        priority: 'high',
        summary: '框架',
        focusAreas: ['组件设计'],
        evidence: [{ source: 'job_description', quote: '前端工程' }],
      },
    ],
    likelyQuestions: ['如何设计组件'],
    missingEvidence: [],
  },
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  const map = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => map.set(k, v),
    removeItem: (k: string) => map.delete(k),
  });
  setActivePinia(createPinia());
});
afterEach(() => {
  usePreparation().deactivate();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('手机独立开场', () => {
  it('本机存储不可用时仍可打开准备页面', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    });
    const store = usePreparation();
    await expect(store.activate()).resolves.toBeUndefined();
    expect(store.loading).toBe(false);
  });

  it('恢复时断网保留任务，重试恢复同一分析', async () => {
    const key = JSON.stringify(['interview.mobile.preparation.v1', 'https://example.test/api']);
    localStorage.setItem(key, JSON.stringify({ profileId: 'profile1', jobId: 'job1' }));
    vi.mocked(api.getJob).mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(job);
    const store = usePreparation();
    await store.activate();
    expect(localStorage.getItem(key)).not.toBeNull();
    expect(store.recoveryPending).toBe(true);
    await store.retryRecovery();
    expect(store.job?.id).toBe('job1');
    expect(store.recoveryPending).toBe(false);
  });

  it('分析请求失败重试时不重复提交已保存的故事', async () => {
    vi.mocked(api.createProfile).mockResolvedValue({
      id: 'profile1',
      resumeText: 'r'.repeat(20),
      displayName: null,
    });
    vi.mocked(api.createStory).mockResolvedValue({ id: 'story1' });
    vi.mocked(api.analyzeJob)
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce(job);
    const store = usePreparation();
    await store.activate();
    store.editResume('r'.repeat(20));
    store.form.jobDescription = job.description;
    store.stories.push({
      title: 'title',
      project: 'project',
      situation: 'situation',
      task: 'task',
      action: 'action',
      result: 'result',
      metrics: [],
    });
    await store.analyze();
    await store.analyze();
    expect(api.createStory).toHaveBeenCalledTimes(1);
    expect(store.job?.id).toBe('job1');
  });

  it('手机创建档案、分析岗位并携带所选模式开始训练', async () => {
    vi.mocked(api.createProfile).mockResolvedValue({
      id: 'profile1',
      resumeText: 'r'.repeat(20),
      displayName: null,
    });
    vi.mocked(api.analyzeJob).mockResolvedValue(job);
    vi.mocked(api.createInterviewSession).mockResolvedValue({ id: 'session1' } as never);
    const store = usePreparation();
    await store.activate();
    store.editResume('r'.repeat(20));
    store.form.targetRole = job.targetRole;
    store.form.jobDescription = job.description;
    await store.analyze();
    expect(store.job?.analysis?.summary).toBe('关注工程能力');
    store.form.feedbackPolicy = 'deferred';
    store.form.timeLimitMinutes = 30;
    store.form.questionCount = 4;
    expect(await store.start()).toBe('session1');
    expect(api.createInterviewSession).toHaveBeenCalledWith({
      profileId: 'profile1',
      jobId: 'job1',
      language: 'zh-CN',
      round: 'technical',
      difficulty: 'l2',
      questionCount: 4,
      feedbackPolicy: 'deferred',
      timeLimitMinutes: 30,
    });
  });
  it('离开后恢复未完成分析，轮询直到完成', async () => {
    vi.mocked(api.createProfile).mockResolvedValue({
      id: 'profile1',
      resumeText: 'r'.repeat(20),
      displayName: null,
    });
    vi.mocked(api.analyzeJob).mockResolvedValue({
      ...job,
      analysisStatus: 'pending',
      analysis: null,
    });
    const store = usePreparation();
    await store.activate();
    store.editResume('r'.repeat(20));
    store.form.targetRole = job.targetRole;
    store.form.jobDescription = job.description;
    await store.analyze();
    store.deactivate();
    vi.mocked(api.getJob)
      .mockResolvedValueOnce({ ...job, analysisStatus: 'processing', analysis: null })
      .mockResolvedValue(job);
    await store.activate();
    expect(store.job?.analysisStatus).toBe('processing');
    await vi.advanceTimersByTimeAsync(2000);
    expect(store.job?.analysisStatus).toBe('completed');
  });
  it('重置后迟到的岗位分析不覆盖新表单', async () => {
    let resolve!: (value: JobRecord) => void;
    vi.mocked(api.createProfile).mockResolvedValue({
      id: 'profile1',
      resumeText: 'r'.repeat(20),
      displayName: null,
    });
    vi.mocked(api.analyzeJob).mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const store = usePreparation();
    await store.activate();
    store.editResume('r'.repeat(20));
    store.form.targetRole = job.targetRole;
    store.form.jobDescription = job.description;
    const pending = store.analyze();
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'));
    store.reset();
    resolve(job);
    await pending;
    expect(store.job).toBeNull();
    expect(store.form.targetRole).toBe('AI Frontend Engineer');
  });
  it('文件上传失败不允许用失效档案开场，改用文本可以重新分析', async () => {
    vi.mocked(api.uploadResume).mockRejectedValue(new Error('文件解析失败'));
    const store = usePreparation();
    await store.activate();
    await store.upload(new File(['test'], 'resume.pdf', { type: 'application/pdf' }));
    expect(store.uploadError).toBe('文件解析失败');
    expect(store.profileId).toBe('');
    expect(await store.start()).toBeUndefined();
  });
});
