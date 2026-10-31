import { onScopeDispose, ref } from 'vue';
import { defineStore } from 'pinia';
import type {
  SessionHistoryItem,
  SessionHistoryQuery,
  SessionReview,
} from '@interview-assistant/contracts';
import { getSessionHistory, getSessionReview } from '../api/interview.js';
import { ApiClientError } from '../lib/http.js';

export type HistoryFilter = NonNullable<SessionHistoryQuery['status']> | '';

function errorText(error: unknown): string {
  if (error instanceof ApiClientError && error.status === 404)
    return '训练记录已不存在，请返回历史列表重新选择';
  return error instanceof Error ? error.message : '读取失败，请稍后重试';
}

export const useHistoryStore = defineStore('history', () => {
  const items = ref<SessionHistoryItem[]>([]);
  const page = ref(1);
  const pageSize = 10;
  const total = ref(0);
  const statusFilter = ref<HistoryFilter>('');
  const listLoading = ref(false);
  const listError = ref('');
  const review = ref<SessionReview | null>(null);
  const reviewLoading = ref(false);
  const reviewError = ref('');
  let listGeneration = 0;
  let reviewGeneration = 0;

  async function loadPage(nextPage = page.value, status = statusFilter.value): Promise<void> {
    const generation = ++listGeneration;
    page.value = nextPage;
    statusFilter.value = status;
    items.value = [];
    listLoading.value = true;
    listError.value = '';
    try {
      const result = await getSessionHistory({
        page: nextPage,
        pageSize,
        ...(status ? { status } : {}),
      });
      if (generation !== listGeneration) return;
      items.value = result.items;
      total.value = result.total;
      page.value = result.page;
    } catch (error) {
      if (generation === listGeneration) listError.value = errorText(error);
    } finally {
      if (generation === listGeneration) listLoading.value = false;
    }
  }

  async function loadReview(id: string): Promise<void> {
    const generation = ++reviewGeneration;
    review.value = null;
    reviewLoading.value = true;
    reviewError.value = '';
    try {
      const result = await getSessionReview(id);
      if (generation === reviewGeneration) review.value = result;
    } catch (error) {
      if (generation === reviewGeneration) reviewError.value = errorText(error);
    } finally {
      if (generation === reviewGeneration) reviewLoading.value = false;
    }
  }

  function cancelList(): void {
    listGeneration++;
    listLoading.value = false;
  }
  function cancelReview(): void {
    reviewGeneration++;
    reviewLoading.value = false;
  }
  onScopeDispose(() => {
    cancelList();
    cancelReview();
  });

  return {
    items,
    page,
    pageSize,
    total,
    statusFilter,
    listLoading,
    listError,
    review,
    reviewLoading,
    reviewError,
    loadPage,
    loadReview,
    cancelList,
    cancelReview,
  };
});
