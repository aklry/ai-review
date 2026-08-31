import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it } from 'vitest';
import type { ApiResponse } from '@interview-assistant/contracts';
import { ApiClientError, createHttpClient, request } from './http.js';

type HealthData = { service: string };

function successAdapter(capture: (config: InternalAxiosRequestConfig) => void): AxiosAdapter {
  return async (config) => {
    capture(config);
    return {
      data: {
        code: 0,
        message: 'ok',
        data: { service: 'interview-assistant-api' },
        requestId: 'req_server',
        timestamp: '2026-08-25T00:00:00.000Z',
      } satisfies ApiResponse<HealthData>,
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    };
  };
}

describe('HTTP client', () => {
  it('adds a request ID and unwraps a successful API envelope', async () => {
    let capturedConfig: InternalAxiosRequestConfig | undefined;
    const client = createHttpClient({
      baseURL: 'http://localhost:3000/api',
      createRequestId: () => 'req_client',
    });
    client.defaults.adapter = successAdapter((config) => {
      capturedConfig = config;
    });

    await expect(request<HealthData>({ method: 'GET', url: '/health' }, client)).resolves.toEqual({
      service: 'interview-assistant-api',
    });
    expect(capturedConfig?.headers.get('X-Request-Id')).toBe('req_client');
  });

  it('converts an API error envelope to a typed client error', async () => {
    const client = createHttpClient({
      baseURL: 'http://localhost:3000/api',
      createRequestId: () => 'req_client',
    });
    client.defaults.adapter = async (config) => {
      const response = {
        data: {
          code: 400,
          message: 'email must be an email',
          data: null,
          requestId: 'req_server',
          timestamp: '2026-08-25T00:00:00.000Z',
        } satisfies ApiResponse<null>,
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        config,
      };
      throw new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, undefined, response);
    };

    await expect(
      request<HealthData>({ method: 'GET', url: '/health' }, client),
    ).rejects.toMatchObject(
      new ApiClientError({
        code: 400,
        message: 'email must be an email',
        requestId: 'req_server',
        status: 400,
      }),
    );
  });
});
