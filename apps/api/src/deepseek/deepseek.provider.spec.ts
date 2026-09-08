import { GatewayTimeoutException, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_DEEPSEEK_TIMEOUT_MS,
  DeepSeekProvider,
  type DeepSeekTransport,
} from './deepseek.provider.js';

const outputSchema = z.object({
  answer: z.string(),
});

function response(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    text: async () => JSON.stringify(body),
  };
}

describe('DeepSeekProvider', () => {
  it('uses a 120 second default model budget for long analysis runs', () => {
    expect(DEFAULT_DEEPSEEK_TIMEOUT_MS).toBe(120_000);
  });

  it('rejects requests when the server API key is missing', async () => {
    const provider = new DeepSeekProvider({
      apiKey: '',
      transport: async () => response({}),
    });

    await expect(
      provider.generateJson({
        taskType: 'test',
        schema: outputSchema,
        systemPrompt: 'Return JSON.',
        userPrompt: 'Hello',
      }),
    ).rejects.toThrow(/DEEPSEEK_API_KEY/);
  });

  it('accepts underscore-separated timeout values from environment variables', async () => {
    const previousTimeout = process.env.DEEPSEEK_TIMEOUT_MS;
    process.env.DEEPSEEK_TIMEOUT_MS = '45_000';

    try {
      let receivedSignal: AbortSignal | undefined;
      const provider = new DeepSeekProvider({
        apiKey: 'server-only-key',
        transport: async (_url, init) => {
          receivedSignal = init.signal;
          await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, 10);
            init.signal?.addEventListener(
              'abort',
              () => {
                clearTimeout(timer);
                reject(new Error('request aborted'));
              },
              { once: true },
            );
          });
          return response({
            choices: [{ message: { content: '{"answer":"ready"}' } }],
            model: 'deepseek-v4-pro',
          });
        },
      });

      await expect(
        provider.generateJson({
          taskType: 'test',
          schema: outputSchema,
          systemPrompt: 'Return JSON.',
          userPrompt: 'Hello',
        }),
      ).resolves.toMatchObject({ data: { answer: 'ready' } });
      expect(receivedSignal).toBeDefined();
    } finally {
      if (previousTimeout === undefined) delete process.env.DEEPSEEK_TIMEOUT_MS;
      else process.env.DEEPSEEK_TIMEOUT_MS = previousTimeout;
    }
  });

  it('parses a valid structured response without leaking prompts', async () => {
    const requests: Array<{ url: string; body: string; headers: Record<string, string> }> = [];
    const transport: DeepSeekTransport = async (url, init) => {
      requests.push({
        url,
        body: String(init.body),
        headers: init.headers as Record<string, string>,
      });
      return response({
        choices: [{ message: { content: '{"answer":"ready"}' } }],
        model: 'deepseek-v4-pro',
        usage: { prompt_tokens: 12, completion_tokens: 4, prompt_cache_hit_tokens: 2 },
      });
    };
    const provider = new DeepSeekProvider({
      apiKey: 'server-only-key',
      transport,
      primaryModel: 'deepseek-v4-pro',
      fallbackModel: 'deepseek-v4-flash',
    });

    const result = await provider.generateJson({
      taskType: 'test',
      schema: outputSchema,
      systemPrompt: 'secret system prompt',
      userPrompt: 'secret user prompt',
    });

    expect(result.data).toEqual({ answer: 'ready' });
    expect(result.model).toBe('deepseek-v4-pro');
    expect(result.degraded).toBe(false);
    expect(result.usage).toEqual({
      inputTokens: 12,
      outputTokens: 4,
      cachedInputTokens: 2,
    });
    expect(requests[0]?.url).toBe('https://api.deepseek.com/chat/completions');
    expect(requests[0]?.headers.Authorization).toBe('Bearer server-only-key');
    expect(requests[0]?.body).toContain('"response_format":{"type":"json_object"}');
  });

  it('passes the requested thinking mode to the model', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const provider = new DeepSeekProvider({
      apiKey: 'server-only-key',
      transport: async (_url, init) => {
        bodies.push(JSON.parse(init.body) as Record<string, unknown>);
        return response({ choices: [{ message: { content: '{"answer":"ready"}' } }] });
      },
    });
    await provider.generateJson({
      taskType: 'job-analysis',
      schema: outputSchema,
      systemPrompt: 'Return JSON.',
      userPrompt: 'Hello',
      thinking: 'disabled',
    });

    expect(bodies[0]?.thinking).toEqual({ type: 'disabled' });
  });

  it('reserves time for fallback after a stalled primary request is aborted', async () => {
    vi.useFakeTimers();
    try {
      const models: string[] = [];
      const provider = new DeepSeekProvider({
        apiKey: 'server-only-key',
        timeoutMs: 120_000,
        primaryModel: 'deepseek-v4-pro',
        fallbackModel: 'deepseek-v4-flash',
        transport: async (_url, init) => {
          const { model } = JSON.parse(init.body) as { model: string };
          models.push(model);
          if (model === 'deepseek-v4-pro') {
            await new Promise((_, reject) => {
              init.signal?.addEventListener('abort', () => reject(new Error('request aborted')), {
                once: true,
              });
            });
          }
          return response({ choices: [{ message: { content: '{"answer":"fallback"}' } }] });
        },
      });
      const result = provider.generateJson({
        taskType: 'test',
        schema: outputSchema,
        systemPrompt: 'Return JSON.',
        userPrompt: 'Hello',
      });
      await vi.advanceTimersByTimeAsync(80_000);

      expect(models).toEqual(['deepseek-v4-pro', 'deepseek-v4-flash']);
      await expect(result).resolves.toMatchObject({ data: { answer: 'fallback' }, degraded: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the full timeout budget when primary and fallback models are identical', async () => {
    vi.useFakeTimers();
    try {
      const provider = new DeepSeekProvider({
        apiKey: 'server-only-key',
        timeoutMs: 120_000,
        primaryModel: 'deepseek-v4-flash',
        fallbackModel: 'deepseek-v4-flash',
        transport: async (_url, init) => {
          await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, 100_000);
            init.signal?.addEventListener(
              'abort',
              () => {
                clearTimeout(timer);
                reject(new Error('request aborted'));
              },
              { once: true },
            );
          });
          return response({ choices: [{ message: { content: '{"answer":"ready"}' } }] });
        },
      });
      const result = provider.generateJson({
        taskType: 'test',
        schema: outputSchema,
        systemPrompt: 'Return JSON.',
        userPrompt: 'Hello',
      });
      await vi.advanceTimersByTimeAsync(100_000);
      await expect(result).resolves.toMatchObject({ data: { answer: 'ready' }, degraded: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back to the flash model when primary generation fails', async () => {
    const models: string[] = [];
    const provider = new DeepSeekProvider({
      apiKey: 'server-only-key',
      transport: async (_url, init) => {
        const requestBody = JSON.parse(String(init.body)) as { model: string };
        models.push(requestBody.model);
        if (models.length === 1) return response({ error: 'timeout' }, false, 504);
        return response({
          choices: [{ message: { content: '{"answer":"fallback"}' } }],
          model: 'deepseek-v4-flash',
          usage: { prompt_tokens: 9, completion_tokens: 3 },
        });
      },
    });

    const result = await provider.generateJson({
      taskType: 'test',
      schema: outputSchema,
      systemPrompt: 'Return JSON.',
      userPrompt: 'Hello',
    });

    expect(result.data).toEqual({ answer: 'fallback' });
    expect(result.model).toBe('deepseek-v4-flash');
    expect(result.degraded).toBe(true);
    expect(models).toEqual(['deepseek-v4-pro', 'deepseek-v4-flash']);
  });

  it('returns a retryable service-unavailable error when DeepSeek cannot be reached', async () => {
    const provider = new DeepSeekProvider({
      apiKey: 'server-only-key',
      primaryModel: 'deepseek-v4-flash',
      fallbackModel: 'deepseek-v4-flash',
      transport: async () => {
        throw new TypeError('fetch failed');
      },
    });

    await expect(
      provider.generateJson({
        taskType: 'test',
        schema: outputSchema,
        systemPrompt: 'Return JSON.',
        userPrompt: 'Hello',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('falls back when the primary response does not match the schema', async () => {
    const models: string[] = [];
    const provider = new DeepSeekProvider({
      apiKey: 'server-only-key',
      transport: async (_url, init) => {
        const requestBody = JSON.parse(String(init.body)) as { model: string };
        models.push(requestBody.model);
        return response({
          choices: [
            {
              message: {
                content: models.length === 1 ? '{"wrong":"shape"}' : '{"answer":"schema fallback"}',
              },
            },
          ],
          model: requestBody.model,
          usage: { prompt_tokens: 9, completion_tokens: 3 },
        });
      },
    });

    const result = await provider.generateJson({
      taskType: 'test',
      schema: outputSchema,
      systemPrompt: 'Return JSON.',
      userPrompt: 'Hello',
    });

    expect(result.data).toEqual({ answer: 'schema fallback' });
    expect(result.degraded).toBe(true);
  });

  it('shares one total timeout budget between primary and fallback models', async () => {
    const aborts: string[] = [];
    const provider = new DeepSeekProvider({
      apiKey: 'server-only-key',
      timeoutMs: 60,
      transport: async (_url, init) => {
        const requestBody = JSON.parse(String(init.body)) as { model: string };
        if (requestBody.model === 'deepseek-v4-pro') {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return response({ error: 'timeout' }, false, 504);
        }

        await new Promise<void>((resolve, reject) => {
          init.signal?.addEventListener(
            'abort',
            () => {
              aborts.push(requestBody.model);
              reject(new Error('request aborted'));
            },
            { once: true },
          );
        });
        return response(
          {
            choices: [{ message: { content: '{"answer":"fallback"}' } }],
            model: 'deepseek-v4-flash',
          },
          true,
          200,
        );
      },
    });

    await expect(
      provider.generateJson({
        taskType: 'test',
        schema: outputSchema,
        systemPrompt: 'Return JSON.',
        userPrompt: 'Hello',
      }),
    ).rejects.toBeInstanceOf(GatewayTimeoutException);
    expect(aborts).toEqual(['deepseek-v4-flash']);
  });

  it('throws a gateway timeout when the total budget is exhausted', async () => {
    const provider = new DeepSeekProvider({
      apiKey: 'server-only-key',
      timeoutMs: 1,
      transport: async (_url, init) => {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, 20);
          init.signal?.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              reject(new Error('request aborted'));
            },
            { once: true },
          );
        });
        return response({
          choices: [{ message: { content: '{"answer":"late"}' } }],
          model: 'deepseek-v4-pro',
        });
      },
    });

    await expect(
      provider.generateJson({
        taskType: 'test',
        schema: outputSchema,
        systemPrompt: 'Return JSON.',
        userPrompt: 'Hello',
      }),
    ).rejects.toBeInstanceOf(GatewayTimeoutException);
  });
});
