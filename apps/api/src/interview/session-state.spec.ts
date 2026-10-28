import { describe, expect, it } from 'vitest';
import { planNextTurn } from './session-state.js';

const base = (id: string) => ({
  id,
  competency: 'project-depth' as const,
  difficulty: 'l2' as const,
  prompt: id,
  isCore: true,
  parentQuestionId: null,
});
const q1 = base('q1'),
  q2 = base('q2'),
  q3 = base('q3');

describe('interview turn routing', () => {
  it('returns to the next main question after a follow-up without skipping it', () => {
    const follow = { ...base('f1'), isCore: false, parentQuestionId: 'q1' };
    const state = planNextTurn([q1, q2, q3, follow], follow, null);
    expect(state.nextQuestion?.id).toBe('q2');
    expect(state.currentQuestionIndex).toBe(1);
    expect(state.status).toBe('active');
  });
  it('keeps the main question index unchanged while asking its follow-up', () => {
    const follow = { ...base('f1'), isCore: false, parentQuestionId: 'q1' };
    expect(planNextTurn([q1, q2, q3], q1, follow)).toMatchObject({
      nextQuestion: { id: 'f1' },
      currentQuestionIndex: 0,
      status: 'active',
    });
  });
  it('marks the final answer as awaiting finish and exposes no active question', () => {
    expect(planNextTurn([q1, q2, q3], q3, null)).toEqual({
      nextQuestion: null,
      currentQuestionIndex: 3,
      status: 'awaiting_finish',
    });
  });
});
