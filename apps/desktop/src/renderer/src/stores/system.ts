import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { HealthResponse } from '@interview-assistant/contracts';
import { getHealth } from '../api/health.js';
import { ApiClientError } from '../lib/http.js';

export const useSystemStore = defineStore('system', () => {
  const health = ref<HealthResponse | null>(null);
  const status = ref<'idle' | 'checking' | 'online' | 'offline'>('idle');
  const errorMessage = ref<string | null>(null);
  const isOnline = computed(() => status.value === 'online');

  async function checkApi(): Promise<void> {
    status.value = 'checking';
    errorMessage.value = null;

    try {
      health.value = await getHealth();
      status.value = 'online';
    } catch (error) {
      health.value = null;
      status.value = 'offline';
      errorMessage.value =
        error instanceof ApiClientError ? error.message : '无法连接到 API 服务';
    }
  }

  return { health, status, errorMessage, isOnline, checkApi };
});
