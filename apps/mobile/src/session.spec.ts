import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { SessionRecord } from '@interview-assistant/api-client';
import { api } from './connection';
import { useSession } from './session';

vi.mock('./connection', () => ({
  address: 'https://personal.example/api',
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
  it('响应丢失后从含 nullable 字段的数据库反馈恢复上一题', async () => {
    const cue = {
      competency: 'project-depth',
      score: 3,
      strengths: ['说明过程'],
      gaps: ['补充量化'],
      nextAction: '补充结果',
      evidence: [{ source: 'answer', quote: '回答内容' }],
      followUpQuestion: null,
    };
    const next = record('q2');
    next.questions[0] = { ...q1, answer: { cue } };
    vi.mocked(api.getInterviewSession).mockResolvedValueOnce(record()).mockResolvedValue(next);
    vi.mocked(api.submitAnswer).mockRejectedValue(new Error('lost'));
    const store = useSession();
    await store.open('s');
    store.edit('回答内容');
    await store.submit();
    expect(store.feedback?.score).toBe(3);
    expect(store.feedbackQuestion?.id).toBe('q1');
  });

  it('转写合并超长后保留全文并阻止提交', async () => {
    vi.mocked(api.getInterviewSession).mockResolvedValue(record());
    const store = useSession();
    await store.open('s');
    store.edit('a'.repeat(19999));
    store.appendTranscript('录音文字');
    await store.submit();
    expect(store.draft.length).toBeGreaterThan(20000);
    expect(store.error).toContain('20,000');
    expect(api.submitAnswer).not.toHaveBeenCalled();
  });
  it('同一会话在提交未结束时重新打开，等待写入后再解锁新进度', async () => {
    let complete!: () => void;
    vi.mocked(api.getInterviewSession)
      .mockResolvedValueOnce(record())
      .mockResolvedValue(record('q2'));
    vi.mocked(api.submitAnswer).mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = () => resolve({ cue: null } as never);
        }),
    );
    const store = useSession();
    await store.open('s');
    store.edit('正在提交的回答');
    const submission = store.submit();
    const reopening = store.open('s');
    expect(store.busy).toBe(true);
    expect(store.needsSync).toBe(true);
    expect(api.getInterviewSession).toHaveBeenCalledTimes(1);
    complete();
    await Promise.all([submission, reopening]);
    expect(store.question?.id).toBe('q2');
    expect(store.busy).toBe(false);
    expect(store.needsSync).toBe(false);
  });
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

  it('暂停和跳过使用服务端当前题目和版本，并在控制后重新同步', async () => {
    vi.mocked(api.getInterviewSession).mockResolvedValue(record());
    const store = useSession();
    await store.open('s');
    vi.mocked(api.getInterviewSession).mockResolvedValueOnce({
      ...record(),
      pausedAt: '2026-11-08T00:00:00.000Z',
    });
    await store.control('pause');
    expect(api.controlSession).toHaveBeenCalledWith('s', 'pause', 'q1', 2);
    expect(store.session?.pausedAt).toBeTruthy();
    vi.mocked(api.getInterviewSession).mockResolvedValueOnce(record());
    await store.control('resume');
    expect(api.controlSession).toHaveBeenLastCalledWith('s', 'resume', 'q1', 2);
    vi.mocked(api.getInterviewSession).mockResolvedValueOnce(record('q2'));
    await store.control('skip');
    expect(store.question?.id).toBe('q2');
    expect(api.controlSession).toHaveBeenLastCalledWith('s', 'skip', 'q1', 2);
  });

  it('允许在回答完全部题目之前主动生成报告', async () => {
    vi.mocked(api.getInterviewSession)
      .mockResolvedValueOnce(record())
      .mockResolvedValue({ ...record(), status: 'completed', activeQuestionId: null });
    const store = useSession();
    await store.open('s');
    await store.finish();
    expect(api.finishInterviewSession).toHaveBeenCalledWith('s');
    expect(store.session?.status).toBe('completed');
    expect(store.question).toBeUndefined();
  });

  it('草稿转写保留原文字，完整模拟不泄漏逐题反馈', async () => {
    vi.mocked(api.getInterviewSession).mockResolvedValue({
      ...record(),
      feedbackPolicy: 'deferred',
    });
    vi.mocked(api.submitAnswer).mockResolvedValue({ cue: { score: 5 } } as never);
    const store = useSession();
    await store.open('s');
    store.edit('文字草稿');
    store.appendTranscript('录音内容');
    expect(store.draft).toBe('文字草稿\n录音内容');
    await store.submit();
    expect(store.feedback).toBeNull();
  });
});
