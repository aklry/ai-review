import { describe, expect, it, vi } from 'vitest';
import { request } from '../lib/http.js';
import { getSessionHistory, getSessionReview, submitAnswer } from './interview.js';

vi.mock('../lib/http.js', () => ({ request: vi.fn(), apiClient: {} }));

describe('interview API', () => {
  it('requests history with query parameters and validates the response', async () => {
    vi.mocked(request).mockResolvedValue({ items: [], page: 1, pageSize: 10, total: 0 });
    await expect(getSessionHistory({ page: 1, pageSize: 10 })).resolves.toMatchObject({ total: 0 });
    expect(request).toHaveBeenLastCalledWith({
      method: 'GET',
      url: '/interview-sessions',
      params: { page: 1, pageSize: 10 },
    });
  });
  it('rejects malformed review responses instead of rendering untyped data', async () => {
    vi.mocked(request).mockResolvedValue({ id: 'broken' });
    await expect(getSessionReview('session/1')).rejects.toThrow();
    expect(request).toHaveBeenLastCalledWith({
      method: 'GET',
      url: '/interview-sessions/session%2F1/review',
    });
  });
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
