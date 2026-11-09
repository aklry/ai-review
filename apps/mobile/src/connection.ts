import { computed } from 'vue';
import {
  createHttpClient,
  createSessionApi,
  createWorkflowApi,
  sendRequest,
} from '@interview-assistant/api-client';
import type { AxiosRequestConfig } from 'axios';

const productionOrigin = 'http://175.178.92.165:3100';
export const address: string =
  import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? '/api' : productionOrigin + '/api');
function transport(baseURL: string) {
  return createHttpClient({
    baseURL,
    createRequestId: () =>
      globalThis.crypto?.randomUUID?.() ??
      'mobile_' + Date.now() + '_' + Math.random().toString(36).slice(2),
  });
}
const client = computed(() => transport(address));
const request = <T>(config: AxiosRequestConfig) => sendRequest<T>(config, client.value);
export const api = { ...createSessionApi(request), ...createWorkflowApi(request) };
export function message(error: unknown) {
  return error instanceof Error ? error.message : '请求失败，请检查连接后重试';
}
