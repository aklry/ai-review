import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { SessionRecord } from '@interview-assistant/api-client';
import { api } from './connection';
import { useSession } from './session';

vi.mock('./connection', () => ({
  address: { value: 'https://personal.example/api' },
  message: (e: Error) => e.message,
  api: {
    getInterviewSession: vi.fn(),
    submitAnswer: vi.fn(),
    controlSession: vi.fn(),
    finishInterviewSession: vi.fn(),
  },
}));
const q1 = {
  id: 'q1',
  prompt: '举一个项目例子',
  isCore: true,
  difficulty: 'l2',
  competency: 'project-depth',
} as const;
function record(active = 'q1'): SessionRecord {
  return {
    id: 's',
    status: 'active',
    version: 2,
    currentQuestionIndex: active === 'q1' ? 0 : 1,
    activeQuestionId: active,
    questions: [q1, { ...q1, id: 'q2' }],
    plan: {
      profileId: 'p',
      jobId: 'j',
      language: 'zh-CN',
      round: 'technical',
      difficulty: 'l2',
      profile: { resumeText: '' },
      job: {
        targetRole: '前端',
        description: '岗位',
        company: null,
        analysis: null,
        analysisStatus: 'completed',
      },
    },
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
    removeItem: (k: string) => values.delete(k),
  });
  setActivePinia(createPinia());
});
describe('手机继续训练', () => {
  it('按服务端题目恢复草稿，桌面已答的题不回填至下一题', async () => {
    const store = useSession();
    vi.mocked(api.getInterviewSession).mockResolvedValue(record());
    await store.open('s');
    store.edit('还没写完');
    store.leave();
    await store.open('s');
    expect(store.draft).toBe('还没写完');
    vi.mocked(api.getInterviewSession).mockResolvedValue(record('q2'));
    await store.refresh();
    expect(store.question?.id).toBe('q2');
    expect(store.draft).toBe('');
  });
  it('响应丢失时以服务端进度为准，多次点击只提交一次', async () => {
    vi.mocked(api.getInterviewSession)
      .mockResolvedValueOnce(record())
      .mockResolvedValue(record('q2'));
    vi.mocked(api.submitAnswer).mockRejectedValue(new Error('响应丢失'));
    const store = useSession();
    await store.open('s');
    store.edit('回答');
    await Promise.all([store.submit(), store.submit()]);
    expect(api.submitAnswer).toHaveBeenCalledTimes(1);
    expect(store.question?.id).toBe('q2');
    expect(store.needsSync).toBe(false);
    expect(store.draft).toBe('');
  });
  it('提交后无法确认服务端状态时，保留回答并等待同步', async () => {
    vi.mocked(api.getInterviewSession)
      .mockResolvedValueOnce(record())
      .mockRejectedValue(new Error('网络中断'));
    vi.mocked(api.submitAnswer).mockRejectedValue(new Error('请求超时'));
    const store = useSession();
    await store.open('s');
    store.edit('待确认的回答');
    await store.submit();
    await store.submit();
    expect(store.needsSync).toBe(true);
    expect(store.draft).toBe('待确认的回答');
    expect(api.submitAnswer).toHaveBeenCalledTimes(1);
  });
  it('旧会话的迟到响应不覆盖新打开的会话', async () => {
    let resolve!: (value: SessionRecord) => void;
    vi.mocked(api.getInterviewSession)
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolve = r;
          }),
      )
      .mockResolvedValueOnce({ ...record('q2'), id: 'new' });
    const store = useSession();
    const first = store.open('s');
    await store.open('new');
    resolve(record());
    await first;
    expect(store.session?.id).toBe('new');
    expect(store.question?.id).toBe('q2');
  });
});
