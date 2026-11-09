import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { PracticeTaskView } from '@interview-assistant/contracts';
import { api } from './connection';
import { usePractice } from './practice';

vi.mock('./connection', () => ({
  address: 'https://practice.example/api',
  message: (cause: Error) => cause.message,
  api: { startPractice: vi.fn(), submitPracticeAnswer: vi.fn() },
}));

const baseAddress = 'https://practice.example/api';
const rubric = {
  bankId: 'bank-1',
  questionVersion: '1.0:l2',
  rubricVersion: 'rubric-v3' as const,
  skillIds: ['project'],
  constraints: ['Explain one concrete example'],
  criteria: [
    { id: 'criterion-1', description: 'Explain the decision' },
    { id: 'criterion-2', description: 'Describe the result' },
    { id: 'criterion-3', description: 'Give evidence' },
    { id: 'criterion-4', description: 'Discuss tradeoffs' },
  ],
  anchors: [
    { score: 1, description: 'No criteria met' },
    { score: 2, description: 'One criterion met' },
    { score: 3, description: 'Two criteria met' },
    { score: 4, description: 'Three criteria met' },
    { score: 5, description: 'All criteria met' },
  ],
};
const original = {
  prompt: 'Explain a project decision.',
  answerText: 'I split the application into modules.',
  cue: {
    competency: 'project-depth' as const,
    score: 2,
    strengths: ['Describes the action'],
    gaps: ['Needs evidence for the result'],
    nextAction: 'Describe the measured outcome.',
    evidence: [{ source: 'answer' as const, quote: 'split the application into modules' }],
  },
};
function task(stage = 0, id = 'task-1', sourceQuestionId = 'question-1'): PracticeTaskView {
  return {
    id,
    sourceQuestionId,
    criterionId: 'criterion-1',
    snapshot: rubric,
    original,
    attempts: Array.from({ length: stage }, (_, index) => ({
      ...original,
      prompt: `Practice prompt ${index}`,
      answerText: `Submitted answer ${index}`,
    })),
    stage,
    prompt: stage < 3 ? `Practice prompt ${stage}` : null,
    freshRetest: stage >= 2,
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: Error) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.resetAllMocks();
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  setActivePinia(createPinia());
});
afterEach(() => vi.unstubAllGlobals());

describe('mobile practice recovery', () => {
  it('retains an oversized combined transcript for correction and never submits it', async () => {
    vi.mocked(api.startPractice).mockResolvedValue(task());
    const store = usePractice();
    await store.open('question-1', 'criterion-1');
    store.edit('a'.repeat(19999));
    store.appendTranscript('Spoken content');
    await store.submit();
    expect(store.draft.length).toBeGreaterThan(20000);
    expect(store.error).toContain('20,000');
    expect(api.submitPracticeAnswer).not.toHaveBeenCalled();
  });
  it('waits for the same target pending write before reopening and unlocking', async () => {
    const write = deferred<PracticeTaskView>();
    vi.mocked(api.startPractice).mockResolvedValueOnce(task()).mockResolvedValue(task(1));
    vi.mocked(api.submitPracticeAnswer).mockReturnValueOnce(write.promise);
    const store = usePractice();
    await store.open('question-1', 'criterion-1');
    store.edit('Submitting stage zero');
    const submission = store.submit();
    const reopening = store.open('question-1', 'criterion-1');
    expect(store.busy).toBe(true);
    expect(store.needsSync).toBe(true);
    expect(api.startPractice).toHaveBeenCalledTimes(1);
    write.resolve(task(1));
    await Promise.all([submission, reopening]);
    expect(store.task?.stage).toBe(1);
    expect(store.busy).toBe(false);
    expect(store.needsSync).toBe(false);
  });
  it('restores task drafts and never carries completed-stage text into the next stage', async () => {
    vi.mocked(api.startPractice).mockResolvedValue(task());
    const store = usePractice();
    await store.open('question-1', 'criterion-1');
    store.edit('Original-stage draft');
    expect(localStorage.getItem(JSON.stringify([baseAddress, 'practice', 'task-1', 0]))).toBe(
      'Original-stage draft',
    );

    store.leave();
    await store.open('question-1', 'criterion-1');
    expect(store.draft).toBe('Original-stage draft');
    localStorage.setItem(
      JSON.stringify([baseAddress, 'practice', 'task-1', 1]),
      'Previously saved case draft',
    );
    vi.mocked(api.startPractice).mockResolvedValue(task(1));
    await store.refresh();

    expect(store.task?.stage).toBe(1);
    expect(store.draft).toBe('Previously saved case draft');
    expect(localStorage.getItem(JSON.stringify([baseAddress, 'practice', 'task-1', 0]))).toBeNull();
    store.edit('An unfinished case answer');
    await store.refresh();
    expect(store.draft).toBe('An unfinished case answer');

    vi.mocked(api.startPractice).mockResolvedValue(task(0, 'task-2', 'question-2'));
    await store.open('question-2', 'criterion-1');
    expect(store.draft).toBe('');
  });

  it('re-reads authoritative state after each of the three submitted stages', async () => {
    vi.mocked(api.startPractice)
      .mockResolvedValueOnce(task(0))
      .mockResolvedValueOnce(task(1))
      .mockResolvedValueOnce(task(2))
      .mockResolvedValueOnce(task(3));
    vi.mocked(api.submitPracticeAnswer).mockResolvedValue(task(0));
    const store = usePractice();
    await store.open('question-1', 'criterion-1');

    for (const stage of [0, 1, 2]) {
      store.edit(`  Stage ${stage} answer  `);
      await store.submit();
      expect(store.task?.stage).toBe(stage + 1);
      expect(store.task?.attempts).toHaveLength(stage + 1);
      expect(store.draft).toBe('');
      expect(store.needsSync).toBe(false);
    }

    expect(api.submitPracticeAnswer).toHaveBeenNthCalledWith(1, 'task-1', 0, 'Stage 0 answer');
    expect(api.submitPracticeAnswer).toHaveBeenNthCalledWith(2, 'task-1', 1, 'Stage 1 answer');
    expect(api.submitPracticeAnswer).toHaveBeenNthCalledWith(3, 'task-1', 2, 'Stage 2 answer');
    expect(api.startPractice).toHaveBeenCalledTimes(4);
    expect(store.task?.original.answerText).toBe(original.answerText);
    await store.submit();
    expect(api.submitPracticeAnswer).toHaveBeenCalledTimes(3);
  });

  it('blocks repeated submissions until a lost response has been reconciled', async () => {
    const write = deferred<PracticeTaskView>();
    const read = deferred<PracticeTaskView>();
    vi.mocked(api.startPractice).mockResolvedValueOnce(task()).mockReturnValueOnce(read.promise);
    vi.mocked(api.submitPracticeAnswer).mockReturnValueOnce(write.promise);
    const store = usePractice();
    await store.open('question-1', 'criterion-1');
    store.edit('An answer whose response may be lost');
    const pending = store.submit();
    await store.submit();
    expect(api.submitPracticeAnswer).toHaveBeenCalledTimes(1);
    write.reject(new Error('Response lost'));
    await vi.waitFor(() => expect(api.startPractice).toHaveBeenCalledTimes(2));

    expect(store.busy).toBe(true);
    expect(store.needsSync).toBe(true);
    await store.submit();
    expect(api.submitPracticeAnswer).toHaveBeenCalledTimes(1);
    read.resolve(task(1));
    await pending;

    expect(store.task?.stage).toBe(1);
    expect(store.draft).toBe('');
    expect(store.needsSync).toBe(false);
    expect(store.busy).toBe(false);
    expect(localStorage.getItem(JSON.stringify([baseAddress, 'practice', 'task-1', 0]))).toBeNull();
  });

  it('keeps the answer and blocks retry when the follow-up read also fails', async () => {
    vi.mocked(api.startPractice)
      .mockResolvedValueOnce(task())
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce(task());
    vi.mocked(api.submitPracticeAnswer).mockRejectedValue(new Error('Timed out'));
    const store = usePractice();
    await store.open('question-1', 'criterion-1');
    store.edit('Keep this unconfirmed answer');
    await store.submit();
    await store.submit();

    expect(store.needsSync).toBe(true);
    expect(store.busy).toBe(false);
    expect(store.draft).toBe('Keep this unconfirmed answer');
    expect(store.error).toContain('Offline');
    expect(api.submitPracticeAnswer).toHaveBeenCalledTimes(1);
    await store.refresh();
    expect(store.needsSync).toBe(false);
    expect(store.draft).toBe('Keep this unconfirmed answer');
  });

  it('ignores a previous selection load and a response received after leaving', async () => {
    const first = deferred<PracticeTaskView>();
    const afterLeave = deferred<PracticeTaskView>();
    vi.mocked(api.startPractice)
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(task(0, 'task-2', 'question-2'))
      .mockReturnValueOnce(afterLeave.promise);
    const store = usePractice();
    const previous = store.open('question-1', 'criterion-1');
    await store.open('question-2', 'criterion-1');
    store.edit('New selection draft');
    first.resolve(task());
    await previous;

    expect(store.task?.id).toBe('task-2');
    expect(store.draft).toBe('New selection draft');
    expect(store.busy).toBe(false);
    const refresh = store.refresh();
    store.leave();
    afterLeave.resolve(task(1, 'task-2', 'question-2'));
    await refresh;
    expect(store.task).toBeNull();
    expect(store.draft).toBe('');
    expect(store.needsSync).toBe(true);
  });

  it('never applies or reconciles an old submit after another practice is opened', async () => {
    const oldWrite = deferred<PracticeTaskView>();
    vi.mocked(api.startPractice)
      .mockResolvedValueOnce(task())
      .mockResolvedValueOnce(task(0, 'task-2', 'question-2'));
    vi.mocked(api.submitPracticeAnswer).mockReturnValueOnce(oldWrite.promise);
    const store = usePractice();
    await store.open('question-1', 'criterion-1');
    store.edit('Old answer');
    const previous = store.submit();
    await store.open('question-2', 'criterion-1');
    store.edit('New answer');
    oldWrite.resolve(task(1));
    await previous;

    expect(store.task?.id).toBe('task-2');
    expect(store.draft).toBe('New answer');
    expect(store.needsSync).toBe(false);
    expect(store.busy).toBe(false);
    expect(api.startPractice).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem(JSON.stringify([baseAddress, 'practice', 'task-1', 0]))).toBe(
      'Old answer',
    );
  });

  it('appends transcription to the editable draft without submitting', async () => {
    vi.mocked(api.startPractice).mockResolvedValue(task());
    const store = usePractice();
    await store.open('question-1', 'criterion-1');
    store.edit('Written answer');
    store.appendTranscript('  Spoken answer  ');
    store.appendTranscript('   ');

    expect(store.draft).toBe('Written answer\nSpoken answer');
    expect(localStorage.getItem(JSON.stringify([baseAddress, 'practice', 'task-1', 0]))).toBe(
      'Written answer\nSpoken answer',
    );
    expect(api.submitPracticeAnswer).not.toHaveBeenCalled();
  });

  it('reports storage failures while retaining an editable in-memory answer', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('Storage unavailable');
      },
      setItem: () => {
        throw new Error('Storage unavailable');
      },
      removeItem: () => {
        throw new Error('Storage unavailable');
      },
    });
    vi.mocked(api.startPractice).mockResolvedValue(task());
    const store = usePractice();
    await store.open('question-1', 'criterion-1');
    store.edit('A usable in-memory draft');

    expect(store.task?.id).toBe('task-1');
    expect(store.draft).toBe('A usable in-memory draft');
    expect(store.storageError).toBeTruthy();
    expect(store.needsSync).toBe(false);
  });
});
