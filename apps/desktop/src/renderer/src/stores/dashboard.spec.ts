import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { SessionHistoryItem, SessionHistoryPage } from '@interview-assistant/contracts';
import { getSessionHistory } from '../api/interview.js';
import { useDashboardStore } from './dashboard.js';

vi.mock('../api/interview.js', () => ({ getSessionHistory: vi.fn() }));
const history = vi.mocked(getSessionHistory);
const item = (
  id: string,
  status: SessionHistoryItem['status'],
  startedAt: string,
): SessionHistoryItem => ({
  id,
  status,
  startedAt,
  targetRole: '前端工程师',
  company: null,
  language: 'zh-CN',
  round: 'technical',
  difficulty: 'l2',
  endedAt: null,
  mainQuestionCount: 4,
  answeredMainQuestionCount: 1,
  followUpCount: 1,
  report: null,
});
const page = (items: SessionHistoryItem[]): SessionHistoryPage => ({
  items,
  page: 1,
  pageSize: 3,
  total: items.length,
});

describe('dashboard training overview', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    history.mockReset();
  });

  it('finds unfinished sessions outside the recent page and selects the newest pending session', async () => {
    const completed = item('recent', 'completed', '2026-11-05T03:00:00.000Z');
    const active = item('older', 'active', '2026-11-01T03:00:00.000Z');
    const awaiting = item('pending', 'awaiting_finish', '2026-11-02T03:00:00.000Z');
    history.mockImplementation(async (query) =>
      page(
        query.status === 'active'
          ? [active]
          : query.status === 'awaiting_finish'
            ? [awaiting]
            : [completed],
      ),
    );
    const store = useDashboardStore();
    await store.load();
    expect(store.recentSessions).toEqual([completed]);
    expect(store.resumeSession?.id).toBe('pending');
    expect(store.latestCompleted?.id).toBe('recent');
    expect(store.isEmpty).toBe(false);
  });

  it('distinguishes a failed load from a first visit, and supports retry', async () => {
    const store = useDashboardStore();
    expect(store.isEmpty).toBe(false);
    history.mockRejectedValue(new Error('offline'));
    await store.load();
    expect(store.error).toBe(true);
    expect(store.isEmpty).toBe(false);
    history.mockResolvedValue(page([]));
    await store.load();
    expect(store.error).toBe(false);
    expect(store.isEmpty).toBe(true);
    expect(store.resumeSession).toBeNull();
  });

  it('does not let late responses replace data loaded after navigating back', async () => {
    let finish!: (result: SessionHistoryPage) => void;
    const delayed = new Promise<SessionHistoryPage>((resolve) => {
      finish = resolve;
    });
    history.mockReturnValue(delayed);
    const store = useDashboardStore();
    const previousLoad = store.load();
    store.cancel();
    history.mockResolvedValue(page([]));
    await store.load();
    finish(page([item('stale', 'active', '2026-11-01T03:00:00.000Z')]));
    await previousLoad;
    expect(store.recentSessions).toEqual([]);
    expect(store.resumeSession).toBeNull();
    expect(store.loading).toBe(false);
  });
});
