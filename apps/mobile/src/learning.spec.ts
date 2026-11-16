import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { LearningItem } from '@interview-assistant/contracts';
import { api } from './connection';
import { compareLearning, useLearning } from './learning';

vi.mock('./connection', () => ({
  address: 'https://example.test/api',
  message: (e: Error) => e.message,
  api: {
    getLearning: vi.fn(),
    dailyLearning: vi.fn(),
    answerLearning: vi.fn(),
    updateLearning: vi.fn(),
  },
}));
function item(id = 'one'): LearningItem {
  return {
    id,
    language: 'zh-CN',
    bookmarked: false,
    reviewStatus: 'none',
    version: 0,
    createdAt: '2026-11-16T00:00:00Z',
    updatedAt: '2026-11-16T00:00:00Z',
    attempts: [],
    question: {
      id: 'q',
      prompt: '题目',
      competency: 'vue-react',
      difficulty: 'l2',
      isCore: true,
      rubricSnapshot: {
        bankId: 'q',
        questionVersion: '1.0:l2',
        rubricVersion: 'rubric-v3',
        skillIds: ['q'],
        constraints: ['约束'],
        criteria: [1, 2, 3, 4].map((n) => ({ id: String(n), description: `评分项${n}` })),
        anchors: [1, 2, 3, 4, 5].map((score) => ({ score, description: '分数' })),
      },
    },
  };
}
function attempt(requestId: string, met = ['1']): LearningItem['attempts'][number] {
  return {
    requestId,
    answerText: '回答内容',
    createdAt: '2026-11-16T01:00:00Z',
    cue: {
      competency: 'vue-react',
      score: met.length + 1,
      strengths: [],
      gaps: [],
      nextAction: '继续',
      evidence: [{ source: 'answer', quote: '回答内容' }],
      rubricEvaluation: {
        bankId: 'q',
        questionVersion: '1.0:l2',
        rubricVersion: 'rubric-v3',
        items: ['1', '2', '3', '4'].map((criterionId) => ({
          criterionId,
          status: met.includes(criterionId) ? 'met' : 'missing',
          reason: '依据',
          quotes: met.includes(criterionId) ? ['回答内容'] : [],
        })),
      },
    },
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  setActivePinia(createPinia());
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  vi.mocked(api.getLearning).mockImplementation(async (id) => item(id));
});
describe('手机学习恢复与对比', () => {
  it('另一设备推进后保留本机尚未提交的回答', async () => {
    const store = useLearning();
    await store.open('one');
    store.edit('尚未提交的本机草稿');
    vi.mocked(api.getLearning).mockResolvedValue({
      ...item(),
      version: 1,
      attempts: [attempt('other-device')],
    });
    await store.refresh();
    expect(store.draft).toBe('尚未提交的本机草稿');
    expect(store.item?.version).toBe(1);
    expect(store.notice).toContain('保留');
    store.leave();
    await store.open('one');
    expect(store.draft).toBe('尚未提交的本机草稿');
  });
  it('跨天同步新任务且旧题草稿可恢复', async () => {
    vi.mocked(api.dailyLearning)
      .mockResolvedValueOnce({ day: '2026-11-16', item: item('one'), completed: false })
      .mockResolvedValueOnce({ day: '2026-11-17', item: item('two'), completed: false });
    const store = useLearning();
    await store.open();
    store.edit('昨天的草稿');
    await store.refresh();
    expect(store.day).toBe('2026-11-17');
    expect(store.item?.id).toBe('two');
    expect(store.draft).toBe('');
    await store.open('one');
    expect(store.draft).toBe('昨天的草稿');
  });
  it('草稿跨重新进入恢复并按题目隔离', async () => {
    const store = useLearning();
    await store.open('one');
    store.edit('我的草稿');
    store.leave();
    await store.open('two');
    expect(store.draft).toBe('');
    await store.open('one');
    expect(store.draft).toBe('我的草稿');
  });
  it('保留手写文字与超长转写，阻止超限提交', async () => {
    const store = useLearning();
    await store.open('one');
    store.edit('原文');
    store.appendTranscript('字'.repeat(20000));
    expect(store.draft.startsWith('原文\n')).toBe(true);
    await store.submit();
    expect(api.answerLearning).not.toHaveBeenCalled();
  });
  it('响应丢失后查到提交记录，恢复结果且不重复提交', async () => {
    const store = useLearning();
    await store.open('one');
    store.edit('回答内容');
    vi.mocked(api.answerLearning).mockImplementation(async (_id, input) => {
      vi.mocked(api.getLearning).mockResolvedValue({
        ...item(),
        version: 1,
        attempts: [attempt(input.requestId)],
      });
      throw new Error('网络中断');
    });
    await store.submit();
    expect(store.item?.attempts).toHaveLength(1);
    expect(store.error).toBe('');
    expect(store.draft).toBe('');
    expect(store.showResults).toBe(true);
    await store.submit();
    expect(api.answerLearning).toHaveBeenCalledTimes(1);
  });
  it('提交与同步均失败时保留草稿，先同步再重试', async () => {
    const store = useLearning();
    await store.open('one');
    store.edit('回答内容');
    vi.mocked(api.answerLearning).mockRejectedValue(new Error('断网'));
    vi.mocked(api.getLearning).mockRejectedValueOnce(new Error('仍断网'));
    await store.submit();
    expect(store.needsSync).toBe(true);
    expect(store.draft).toBe('回答内容');
    await store.submit();
    expect(api.answerLearning).toHaveBeenCalledTimes(1);
    await store.refresh();
    expect(store.needsSync).toBe(false);
    await store.submit();
    expect(vi.mocked(api.answerLearning).mock.calls[0]?.[1].requestId).toBe(
      vi.mocked(api.answerLearning).mock.calls[1]?.[1].requestId,
    );
  });
  it('切题后迟到评分不覆盖新题草稿', async () => {
    let resolve!: (value: LearningItem) => void;
    vi.mocked(api.answerLearning).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const store = useLearning();
    await store.open('one');
    store.edit('回答内容');
    const pending = store.submit();
    store.leave();
    await store.open('two');
    store.edit('新草稿');
    resolve({ ...item('one'), version: 1, attempts: [attempt('old')] });
    await pending;
    expect(store.item?.id).toBe('two');
    expect(store.draft).toBe('新草稿');
  });
  it('连续点击仅提交一次', async () => {
    const store = useLearning();
    await store.open('one');
    store.edit('回答内容');
    vi.mocked(api.answerLearning).mockResolvedValue({
      ...item(),
      version: 1,
      attempts: [attempt('id')],
    });
    await Promise.all([store.submit(), store.submit()]);
    expect(api.answerLearning).toHaveBeenCalledTimes(1);
  });
  it('单次不伪造变化，区分改善与退步，拒绝跨版本对比', () => {
    const value = item();
    value.attempts = [attempt('first')];
    expect(compareLearning(value)).toEqual([]);
    value.attempts.push(attempt('last', ['2']));
    expect(compareLearning(value).map((row) => row.change)).toEqual([
      '需重新加强',
      '新满足',
      '仍待加强',
      '仍待加强',
    ]);
    value.attempts[1]!.cue.rubricEvaluation!.questionVersion = '2.0:l2';
    expect(compareLearning(value)).toEqual([]);
  });
  it('已有历史的今日待练题仍先显示作答区', async () => {
    vi.mocked(api.dailyLearning).mockResolvedValue({
      day: '2026-11-16',
      completed: false,
      item: { ...item(), attempts: [attempt('import:q')] },
    });
    const store = useLearning();
    await store.open();
    expect(store.showResults).toBe(false);
    expect(store.day).toBe('2026-11-16');
  });
});
