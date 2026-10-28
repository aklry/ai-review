import { describe, expect, it, vi } from 'vitest';
import { request } from '../lib/http.js';
import { submitAnswer } from './interview.js';

vi.mock('../lib/http.js', () => ({ request: vi.fn(), apiClient: {} }));

describe('interview API', () => {
  it('allows both coaching and the optional follow-up model budgets before timing out', async () => {
    vi.mocked(request).mockResolvedValue({});
    await submitAnswer('session_1', { questionId: 'question_1', answerText: 'I built it.' });
    expect(request).toHaveBeenCalledWith({
      method: 'POST',
      url: '/interview-sessions/session_1/answers',
      data: { questionId: 'question_1', answerText: 'I built it.' },
      timeout: 300_000,
    });
  });
});
