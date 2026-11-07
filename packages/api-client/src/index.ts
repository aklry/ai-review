export * from './sessions.js';
import axios, { AxiosError, type AxiosInstance, type AxiosRequestConfig } from 'axios';
import type { ApiResponse } from '@interview-assistant/contracts';

type HttpClientOptions = {
  baseURL: string;
  createRequestId: () => string;
};

type ApiErrorOptions = {
  code: number;
  message: string;
  requestId: string | undefined;
  status: number | undefined;
};

export const DEFAULT_API_TIMEOUT_MS = 180_000;

export class ApiClientError extends Error {
  readonly code: number;
  readonly requestId: string | undefined;
  readonly status: number | undefined;

  constructor({ code, message, requestId, status }: ApiErrorOptions) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.requestId = requestId;
    this.status = status;
  }
}

export function createHttpClient({ baseURL, createRequestId }: HttpClientOptions): AxiosInstance {
  const client = axios.create({
    baseURL,
    timeout: DEFAULT_API_TIMEOUT_MS,
    headers: {
      Accept: 'application/json',
    },
  });

  client.interceptors.request.use((config) => {
    config.headers.set('X-Request-Id', createRequestId());
    return config;
  });

  client.interceptors.response.use(
    (response) => {
      if (!isApiResponse(response.data)) {
        return Promise.reject(
          new ApiClientError({
            code: response.status,
            message: 'Invalid API response',
            requestId: response.headers['x-request-id'],
            status: response.status,
          }),
        );
      }
      return response;
    },
    (error: unknown) => Promise.reject(toApiClientError(error)),
  );

  return client;
}

export async function sendRequest<T>(
  config: AxiosRequestConfig,
  client: AxiosInstance,
): Promise<T> {
  const response = await client.request<ApiResponse<T>>(config);
  if (response.data.code !== 0) {
    throw new ApiClientError({
      code: response.data.code,
      message: response.data.message,
      requestId: response.data.requestId,
      status: response.status,
    });
  }
  return response.data.data;
}

function toApiClientError(error: unknown): ApiClientError {
  if (error instanceof ApiClientError) return error;

  if (error instanceof AxiosError) {
    const responseData = error.response?.data;
    if (isApiResponse(responseData)) {
      return new ApiClientError({
        code: responseData.code,
        message: responseData.message,
        requestId: responseData.requestId,
        status: error.response?.status,
      });
    }

    return new ApiClientError({
      code: error.response?.status ?? 0,
      message:
        error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT'
          ? '请求超时，请稍后重试'
          : error.message || 'Network request failed',
      requestId: error.response?.headers['x-request-id'],
      status: error.response?.status,
    });
  }

  return new ApiClientError({
    code: 0,
    message: 'Unexpected client error',
    requestId: undefined,
    status: undefined,
  });
}

function isApiResponse(value: unknown): value is ApiResponse<unknown> {
  if (typeof value !== 'object' || value === null) return false;

  const candidate = value as Partial<ApiResponse<unknown>>;
  return (
    typeof candidate.code === 'number' &&
    typeof candidate.message === 'string' &&
    typeof candidate.requestId === 'string' &&
    typeof candidate.timestamp === 'string' &&
    'data' in candidate
  );
}
