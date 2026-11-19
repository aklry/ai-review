import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PracticeTaskView } from '@interview-assistant/contracts';
import { startPractice, submitPracticeAnswer } from '../api/interview.js';
import { usePracticeStore } from './practice.js';

vi.mock('../api/interview.js', () => ({
  startPractice: vi.fn(),
  submitPracticeAnswer: vi.fn(),
}));

const start = vi.mocked(startPractice);
const submit = vi.mocked(submitPracticeAnswer);
const prompt = 'Explain how you measured the result.';
const original: PracticeTaskView['original'] = {
  prompt,
  answerText: 'Initial answer',
  cue: {
    competency: 'project-depth',
    score: 2,
    strengths: [],
    gaps: [],
    nextAction: 'Explain the measurement.',
    evidence: [],
  },
};
function task(answers: string[] = [], id = 'task'): PracticeTaskView {
  return {
    id,
    sourceQuestionId: 'q1',
    criterionId: 'evidence',
    snapshot: {
      bankId: 'test',
      questionVersion: '1',
      rubricVersion: 'rubric-v3',
      skillIds: [],
      constraints: [],
      criteria: [{ id: 'evidence', description: 'Show measurement evidence' }],
      anchors: [],
    },
    original,
    attempts: answers.map((answerText) => ({ ...original, answerText })),
    stage: answers.length,
    prompt: answers.length < 3 ? prompt : null,
    freshRetest: false,
  };
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

describe('desktop practice recovery', () => {
  it('restores a saved draft only for its task and stage', async () => {
    start.mockResolvedValue(task());
    const store = usePracticeStore();
    await store.open('q1', 'evidence');
    store.edit('Saved draft');
    store.leave();

    const reopened = usePracticeStore(createPinia());
    await reopened.open('q1', 'evidence');
    expect(reopened.answer).toBe('Saved draft');
    start.mockResolvedValueOnce(task([], 'other'));
    await reopened.open('q2', 'evidence');
    expect(reopened.answer).toBe('');

    start.mockResolvedValue(task(['Different answer on another device']));
    await reopened.open('q1', 'evidence');
    expect(reopened.answer).toBe('');
    expect(reopened.earlierDrafts).toEqual([{ stage: 0, text: 'Saved draft' }]);
  });

  it('preserves the draft and blocks a second submission until a failed sync succeeds', async () => {
    start.mockResolvedValue(task());
    const store = usePracticeStore();
    await store.open('q1', 'evidence');
    store.edit('Explain the experiment');
    start.mockRejectedValueOnce(new Error('Offline'));
    submit.mockRejectedValueOnce(new Error('Connection lost'));
    await store.submit();

    expect(store.answer).toBe('Explain the experiment');
    expect(store.needsSync).toBe(true);
    await store.submit();
    expect(submit).toHaveBeenCalledTimes(1);

    await store.sync();
    expect(store.needsSync).toBe(false);
    expect(store.answer).toBe('Explain the experiment');
  });

  it('recognizes a committed submission after the response is lost', async () => {
    start.mockResolvedValueOnce(task()).mockResolvedValue(task(['Measured before and after']));
    submit.mockRejectedValueOnce(new Error('Response lost'));
    const store = usePracticeStore();
    await store.open('q1', 'evidence');
    store.edit(' Measured before and after ');
    await store.submit();

    expect(submit).toHaveBeenCalledExactlyOnceWith('task', 0, 'Measured before and after');
    expect(store.task?.stage).toBe(1);
    expect(store.answer).toBe('');
    expect(store.earlierDrafts).toEqual([]);
    expect(store.error).toBe('');
    await store.open('q1', 'evidence');
    expect(store.earlierDrafts).toEqual([]);
  });

  it('waits for an in-flight submission when re-entering the same practice', async () => {
    let resolveWrite!: (value: PracticeTaskView) => void;
    const write = new Promise<PracticeTaskView>((resolve) => {
      resolveWrite = resolve;
    });
    start.mockResolvedValueOnce(task()).mockResolvedValue(task(['First stage answer']));
    submit.mockReturnValueOnce(write);
    const store = usePracticeStore();
    await store.open('q1', 'evidence');
    store.edit('First stage answer');
    const submitting = store.submit();
    store.leave();
    const reopening = store.open('q1', 'evidence');

    expect(start).toHaveBeenCalledTimes(1);
    resolveWrite(task(['First stage answer']));
    await Promise.all([submitting, reopening]);
    expect(store.task?.stage).toBe(1);
    expect(store.answer).toBe('');
  });
});
