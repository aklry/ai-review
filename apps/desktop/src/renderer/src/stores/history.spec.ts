import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import * as api from '../api/interview.js';
import { useHistoryStore } from './history.js';

vi.mock('../api/interview.js');

describe('history browsing', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setActivePinia(createPinia());
  });

  it('loads the requested page and filters without mutating active training recovery', async () => {
    vi.mocked(api.getSessionHistory).mockResolvedValue({
      page: 2,
      pageSize: 10,
      total: 12,
      items: [],
    });
    const store = useHistoryStore();
    await store.loadPage(2, 'completed');
    expect(api.getSessionHistory).toHaveBeenCalledWith({
      page: 2,
      pageSize: 10,
      status: 'completed',
    });
    expect(store.page).toBe(2);
    expect(store.total).toBe(12);
    expect(store.listLoading).toBe(false);
  });

  it('rejects a stale page response after a filter change', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof api.getSessionHistory>>) => void;
    vi.mocked(api.getSessionHistory).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    vi.mocked(api.getSessionHistory).mockResolvedValueOnce({
      page: 1,
      pageSize: 10,
      total: 0,
      items: [],
    });
    const store = useHistoryStore();
    const first = store.loadPage(2, 'active');
    await store.loadPage(1, 'completed');
    resolve({ page: 2, pageSize: 10, total: 99, items: [] });
    await first;
    expect(store.page).toBe(1);
    expect(store.total).toBe(0);
    expect(store.statusFilter).toBe('completed');
  });

  it('exposes a retryable error and clears stale review content on failure', async () => {
    vi.mocked(api.getSessionReview).mockRejectedValue(new Error('服务暂不可用'));
    const store = useHistoryStore();
    await store.loadReview('missing');
    expect(store.review).toBeNull();
    expect(store.reviewError).toBe('服务暂不可用');
    expect(store.reviewLoading).toBe(false);
  });

  it('does not apply a review response after leaving the page', async () => {
    let resolve!: (value: Awaited<ReturnType<typeof api.getSessionReview>>) => void;
    vi.mocked(api.getSessionReview).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const store = useHistoryStore();
    const request = store.loadReview('s1');
    store.cancelReview();
    resolve({ id: 's1' } as never);
    await request;
    expect(store.review).toBeNull();
    expect(store.reviewLoading).toBe(false);
  });
});
