import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { parseModelJson } from '@interview-assistant/agent-core';
import { ChatDeepSeek } from '@langchain/deepseek';
import type { ZodType } from 'zod';

export type DeepSeekTransportInit = {
  method: 'POST';
  headers: Record<string, string>;
  body: string;
  signal?: AbortSignal;
};

export type DeepSeekTransportResponse = {
  ok: boolean;
  status: number;
  text(): Promise<string>;
};

export type DeepSeekTransport = (
  url: string,
  init: DeepSeekTransportInit,
) => Promise<DeepSeekTransportResponse>;

export type DeepSeekRequest<T> = {
  taskType: string;
  schema: ZodType<T>;
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens?: number;
  thinking?: 'enabled' | 'disabled';
};

export type ModelUsage = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
};

export type DeepSeekResult<T> = {
  data: T;
  usage: ModelUsage;
  model: string;
  degraded: boolean;
};

type DeepSeekProviderOptions = {
  apiKey?: string;
  baseUrl?: string;
  primaryModel?: string;
  fallbackModel?: string;
  timeoutMs?: number;
  transport?: DeepSeekTransport;
};

export const DEFAULT_DEEPSEEK_TIMEOUT_MS = 120_000;

type ChatCompletionPayload = {
  choices?: Array<{ message?: { content?: unknown } }>;
  model?: unknown;
  usage?: {
    prompt_tokens?: unknown;
    completion_tokens?: unknown;
    prompt_cache_hit_tokens?: unknown;
  };
  error?: { message?: unknown };
};

@Injectable()
export class DeepSeekProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly primaryModel: string;
  private readonly fallbackModel: string;
  private readonly timeoutMs: number;
  private readonly transport: DeepSeekTransport;

  constructor(options: DeepSeekProviderOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.DEEPSEEK_API_KEY ?? '';
    this.baseUrl = (
      options.baseUrl ??
      process.env.DEEPSEEK_BASE_URL ??
      'https://api.deepseek.com'
    ).replace(/\/$/, '');
    this.primaryModel =
      options.primaryModel ?? process.env.DEEPSEEK_MODEL_PRIMARY ?? 'deepseek-v4-pro';
    this.fallbackModel =
      options.fallbackModel ?? process.env.DEEPSEEK_MODEL_FALLBACK ?? 'deepseek-v4-flash';
    this.timeoutMs = options.timeoutMs ?? parseTimeoutMs(process.env.DEEPSEEK_TIMEOUT_MS);
    this.transport =
      options.transport ??
      (async (url, init) => {
        const response = await fetch(url, init);
        return {
          ok: response.ok,
          status: response.status,
          text: () => response.text(),
        };
      });
  }

  async generateJson<T>(request: DeepSeekRequest<T>): Promise<DeepSeekResult<T>> {
    if (!this.apiKey.trim()) {
      throw new Error('DEEPSEEK_API_KEY is required on the API server');
    }

    const startedAt = Date.now();
    const deadline = startedAt + this.timeoutMs;
    // Reserve one third of the total budget for a different fallback model.
    const primaryDeadline =
      this.fallbackModel === this.primaryModel
        ? deadline
        : startedAt + Math.max(1, Math.floor((this.timeoutMs * 2) / 3));
    try {
      return await this.generateWithModel(request, this.primaryModel, false, primaryDeadline);
    } catch (primaryError) {
      if (this.fallbackModel === this.primaryModel) {
        throw primaryError;
      }
      return this.generateWithModel(request, this.fallbackModel, true, deadline);
    }
  }

  private async generateWithModel<T>(
    request: DeepSeekRequest<T>,
    model: string,
    degraded: boolean,
    deadline: number,
  ): Promise<DeepSeekResult<T>> {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new GatewayTimeoutException('DeepSeek generation timed out');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), remainingMs);

    try {
      let payload: ChatCompletionPayload = {};
      const client = new ChatDeepSeek({
        apiKey: this.apiKey,
        model,
        maxTokens: request.maxOutputTokens ?? 4_000,
        temperature: 0.2,
        maxRetries: 0,
        timeout: remainingMs,
        modelKwargs: {
          response_format: { type: 'json_object' },
          ...(request.thinking ? { thinking: { type: request.thinking } } : {}),
        },
        configuration: {
          baseURL: this.baseUrl,
          fetch: async (url, init) => {
            const response = await this.transport(String(url), {
              method: 'POST',
              headers: Object.fromEntries(new Headers(init?.headers).entries()),
              body: String(init?.body ?? ''),
              signal: init?.signal ?? controller.signal,
            });
            const rawBody = await response.text();
            payload = parseJsonPayload(rawBody);
            return new Response(rawBody, {
              status: response.status,
              headers: { 'Content-Type': 'application/json' },
            });
          },
        },
      });
      const message = await client.invoke(
        [
          ['system', request.systemPrompt],
          ['human', request.userPrompt],
        ],
        { signal: controller.signal },
      );
      const content = typeof message.content === 'string' ? message.content : getContent(payload);
      return {
        data: parseModelJson(request.schema, content),
        usage: {
          inputTokens: getNumber(payload.usage?.prompt_tokens),
          outputTokens: getNumber(payload.usage?.completion_tokens),
          cachedInputTokens: getNumber(payload.usage?.prompt_cache_hit_tokens),
        },
        model: typeof payload.model === 'string' ? payload.model : model,
        degraded,
      };
    } catch (error) {
      if (controller.signal.aborted || (error instanceof Error && isTimeoutError(error))) {
        throw new GatewayTimeoutException('DeepSeek generation timed out');
      }
      if (error instanceof BadGatewayException) {
        throw error;
      }
      if (
        typeof error === 'object' &&
        error !== null &&
        'status' in error &&
        typeof error.status === 'number'
      ) {
        throw new BadGatewayException(`DeepSeek request failed with status ${error.status}`);
      }
      if (error instanceof Error && error.message.startsWith('Invalid model output:')) {
        const detail = error.message.replace(/^Invalid model output:\s*/i, '');
        // Zod's message contains only schema paths and validation reasons; it
        // does not include the resume, JD, prompt, or API key.
        console.warn(`[deepseek] invalid structured output: ${detail}`);
        throw new BadGatewayException(`DeepSeek returned invalid structured output: ${detail}`);
      }
      const message = error instanceof Error ? error.message : 'Unknown DeepSeek error';
      throw new ServiceUnavailableException(`DeepSeek service unavailable: ${message}`);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function parseJsonPayload(rawBody: string): ChatCompletionPayload {
  try {
    return JSON.parse(rawBody) as ChatCompletionPayload;
  } catch {
    throw new Error('DeepSeek returned a non-JSON response');
  }
}

function getContent(body: ChatCompletionPayload): string {
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error(`DeepSeek response did not include message content: ${getErrorMessage(body)}`);
  }
  return content;
}

function getErrorMessage(body: ChatCompletionPayload): string {
  return typeof body.error?.message === 'string' ? body.error.message : 'unknown provider error';
}

function getNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function parseTimeoutMs(value: string | undefined): number {
  const normalized = value?.replace(/_/g, '').trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DEEPSEEK_TIMEOUT_MS;
}

function isTimeoutError(error: Error): boolean {
  return error.name === 'AbortError' || error.message === 'request aborted';
}
