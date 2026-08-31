import type { HealthResponse } from '@interview-assistant/contracts';
import { request } from '../lib/http.js';

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>({ method: 'GET', url: '/health' });
}
