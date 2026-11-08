import { computed, ref } from 'vue';
import { createHttpClient, createSessionApi, sendRequest } from '@interview-assistant/api-client';
import { healthResponseSchema } from '@interview-assistant/contracts';
import type { AxiosRequestConfig } from 'axios';

const setting = 'interview.mobile.api';
const productionOrigin = 'http://175.178.92.165:3100';
const defaultAddress: string =
  import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? '/api' : productionOrigin + '/api');
function savedAddress(): string {
  try {
    return localStorage.getItem(setting) || defaultAddress;
  } catch {
    return defaultAddress;
  }
}
export const address = ref(savedAddress());
export function normalizeAddress(input: string): string {
  const value = input.trim();
  if (value === '/api' && import.meta.env.DEV) return value;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('请输入完整的 API 地址');
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.origin === productionOrigin))
    throw new Error('自定义服务器请使用 HTTPS 地址');
  if (url.username || url.password || url.search || url.hash)
    throw new Error('API 地址不能包含凭据、查询参数或片段');
  if (url.pathname === '/') url.pathname = '/api';
  return url.href.replace(/\/+$/, '');
}
function transport(baseURL: string) {
  return createHttpClient({
    baseURL,
    createRequestId: () =>
      globalThis.crypto?.randomUUID?.() ??
      'mobile_' + Date.now() + '_' + Math.random().toString(36).slice(2),
  });
}
export async function connect(input: string) {
  const base = normalizeAddress(input);
  healthResponseSchema.parse(
    await sendRequest({ url: '/health', timeout: 10000 }, transport(base)),
  );
  localStorage.setItem(setting, base);
  address.value = base;
}
const client = computed(() => transport(normalizeAddress(address.value)));
export const api = createSessionApi(<T>(config: AxiosRequestConfig) =>
  sendRequest<T>(config, client.value),
);
export function message(error: unknown) {
  return error instanceof Error ? error.message : '请求失败，请检查连接后重试';
}
