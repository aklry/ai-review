import { computed, onScopeDispose, ref } from 'vue';
import { defineStore } from 'pinia';
import type { SessionHistoryItem } from '@interview-assistant/contracts';
import { getSessionHistory } from '../api/interview.js';

export const useDashboardStore = defineStore('dashboard', () => {
  const recentSessions = ref<SessionHistoryItem[]>([]);
  const resumeSession = ref<SessionHistoryItem | null>(null);
  const latestCompleted = ref<SessionHistoryItem | null>(null);
  const loading = ref(true);
  const error = ref(false);
  const isEmpty = computed(() => !loading.value && !error.value && !recentSessions.value.length);
  let generation = 0;

  async function load(): Promise<void> {
    const requestGeneration = ++generation;
    loading.value = true;
    error.value = false;
    try {
      // Status queries also find unfinished sessions outside the recent page.
      const [recent, active, awaiting, completed] = await Promise.all([
        getSessionHistory({ page: 1, pageSize: 3 }),
        getSessionHistory({ page: 1, pageSize: 1, status: 'active' }),
        getSessionHistory({ page: 1, pageSize: 1, status: 'awaiting_finish' }),
        getSessionHistory({ page: 1, pageSize: 1, status: 'completed' }),
      ]);
      if (requestGeneration !== generation) return;
      recentSessions.value = recent.items;
      resumeSession.value =
        [...active.items, ...awaiting.items].sort(
          (a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt) || b.id.localeCompare(a.id),
        )[0] ?? null;
      latestCompleted.value = completed.items[0] ?? null;
    } catch {
      if (requestGeneration !== generation) return;
      recentSessions.value = [];
      resumeSession.value = null;
      latestCompleted.value = null;
      error.value = true;
    } finally {
      if (requestGeneration === generation) loading.value = false;
    }
  }

  function cancel(): void {
    generation++;
    loading.value = false;
  }
  onScopeDispose(cancel);

  return { recentSessions, resumeSession, latestCompleted, loading, error, isEmpty, load, cancel };
});
