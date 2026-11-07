import type { AxiosRequestConfig } from 'axios';
import { createHttpClient, sendRequest } from '@interview-assistant/api-client';
export {
  ApiClientError,
  createHttpClient,
  DEFAULT_API_TIMEOUT_MS,
} from '@interview-assistant/api-client';

const defaultApiBaseUrl =
  typeof window === 'undefined' ? 'http://localhost:3000/api' : window.desktopApi.apiBaseUrl;

export const apiClient = createHttpClient({
  baseURL: defaultApiBaseUrl,
  createRequestId,
});

function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `desktop_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function request<T>(config: AxiosRequestConfig, client = apiClient): Promise<T> {
  return sendRequest<T>(config, client);
}
