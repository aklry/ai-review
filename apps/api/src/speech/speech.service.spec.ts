import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpeechService } from './speech.service.js';
import { uploadWav } from './wav.test-fixture.js';

type Handler = (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;

describe('SpeechService', () => {
  let handler: Handler;
  let baseUrl: string;
  const server = createServer((request, response) => {
    void handler(request, response);
  });
  const service = new SpeechService();

  beforeEach(async () => {
    handler = (_request, response) => {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ text: '  hello from the recording  ' }));
    };
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test server address');
    baseUrl = `http://127.0.0.1:${address.port}/v1`;
    vi.stubEnv('ASR_BASE_URL', baseUrl);
    vi.stubEnv('ASR_MODEL', 'test-transcriber');
    vi.stubEnv('ASR_API_KEY', 'server-only-test-secret');
    vi.stubEnv('ASR_TIMEOUT_MS', '5000');
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it.each([
    ['zh-CN', 'zh'],
    ['en-US', 'en'],
    ['mixed', null],
  ] as const)(
    'sends validated WAV and %s language to the configured transcription endpoint',
    async (language, providerLanguage) => {
      let observed: {
        url: string | undefined;
        authorization: string | undefined;
        form: FormData | undefined;
      } = { url: undefined, authorization: undefined, form: undefined };
      const file = uploadWav();
      handler = async (request, response) => {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        const multipart = new Response(Buffer.concat(chunks), {
          headers: { 'content-type': String(request.headers['content-type']) },
        });
        observed = {
          url: request.url,
          authorization: request.headers.authorization,
          form: await multipart.formData(),
        };
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ text: '  hello from the recording  ' }));
      };

      await expect(service.transcribe(file, language)).resolves.toEqual({
        text: 'hello from the recording',
      });
      expect(observed.url).toBe('/v1/audio/transcriptions');
      expect(observed.authorization).toBe('Bearer server-only-test-secret');
      expect(observed.form?.get('model')).toBe('test-transcriber');
      expect(observed.form?.get('language')).toBe(providerLanguage);
      const sentFile = observed.form?.get('file') as File;
      expect(sentFile.type).toBe('audio/wav');
      expect(Buffer.from(await sentFile.arrayBuffer())).toEqual(file.buffer);
    },
  );

  it('allows a self-hosted service without an API key and normalizes a trailing slash', async () => {
    vi.stubEnv('ASR_BASE_URL', `${baseUrl}/`);
    vi.stubEnv('ASR_API_KEY', '');
    let authorization: string | undefined;
    let path: string | undefined;
    handler = (request, response) => {
      authorization = request.headers.authorization;
      path = request.url;
      response.end(JSON.stringify({ text: 'hello' }));
    };
    await expect(service.transcribe(uploadWav(), 'mixed')).resolves.toEqual({ text: 'hello' });
    expect(authorization).toBeUndefined();
    expect(path).toBe('/v1/audio/transcriptions');
  });

  it.each(['ASR_BASE_URL', 'ASR_MODEL'])(
    'reports missing %s without exposing credentials',
    async (name) => {
      vi.stubEnv(name, '');
      await expect(service.transcribe(uploadWav(), 'zh-CN')).rejects.toMatchObject({
        status: 503,
        message: expect.stringContaining('未配置'),
      });
    },
  );

  it.each([
    'not a URL',
    'file:///secret',
    'https://user:secret@example.com/v1',
    'https://example.com/v1?key=secret',
  ])('rejects invalid or credential-bearing ASR roots: %s', async (url) => {
    vi.stubEnv('ASR_BASE_URL', url);
    await expect(service.transcribe(uploadWav(), 'zh-CN')).rejects.toMatchObject({ status: 503 });
  });

  it('rejects a missing file, forged WAV and unsupported language before contacting upstream', async () => {
    let called = false;
    handler = (_request, response) => {
      called = true;
      response.end('{}');
    };
    await expect(service.transcribe(undefined, 'zh-CN')).rejects.toMatchObject({ status: 400 });
    await expect(
      service.transcribe(uploadWav(Buffer.from('forged audio')), 'zh-CN'),
    ).rejects.toMatchObject({ status: 400 });
    await expect(service.transcribe(uploadWav(), 'fr-FR')).rejects.toMatchObject({ status: 400 });
    await expect(service.transcribe(uploadWav(), undefined)).rejects.toMatchObject({ status: 400 });
    expect(called).toBe(false);
  });

  it('uses actual bytes to enforce upload size instead of trusting multipart metadata', async () => {
    const file = uploadWav(Buffer.alloc(6 * 1024 * 1024 + 1));
    file.size = 44;
    await expect(service.transcribe(file, 'zh-CN')).rejects.toMatchObject({ status: 413 });
  });

  it('hides upstream failure bodies and returns a readable error', async () => {
    handler = (_request, response) => {
      response.statusCode = 401;
      response.end('provider secret=server-only-test-secret audio=private-recording');
    };
    await expect(service.transcribe(uploadWav(), 'zh-CN')).rejects.toMatchObject({
      status: 502,
      message: expect.stringContaining('暂时不可用'),
    });
  });

  it.each(['{}', '{"text":"  "}', '{"text":42}', '<html>bad gateway</html>'])(
    'rejects an unusable transcription response %s',
    async (body) => {
      handler = (_request, response) => {
        response.end(body);
      };
      await expect(service.transcribe(uploadWav(), 'en-US')).rejects.toMatchObject({ status: 502 });
    },
  );

  it('rejects transcription text exceeding the shared answer limit', async () => {
    handler = (_request, response) => {
      response.end(JSON.stringify({ text: 'a'.repeat(20001) }));
    };
    await expect(service.transcribe(uploadWav(), 'en-US')).rejects.toMatchObject({ status: 502 });
  });

  it('aborts a slow upstream and returns a readable timeout', async () => {
    vi.stubEnv('ASR_TIMEOUT_MS', '20');
    handler = () => undefined;
    await expect(service.transcribe(uploadWav(), 'zh-CN')).rejects.toMatchObject({
      status: 504,
      message: expect.stringContaining('超时'),
    });
  });

  it('times out while waiting for the upstream response body', async () => {
    vi.stubEnv('ASR_TIMEOUT_MS', '50');
    handler = (_request, response) => {
      response.setHeader('Content-Type', 'application/json');
      response.writeHead(200);
      response.flushHeaders();
      response.write('{"text":');
    };
    await expect(service.transcribe(uploadWav(), 'zh-CN')).rejects.toMatchObject({
      status: 504,
      message: expect.stringContaining('超时'),
    });
  });

  it('does not expose internal network failures', async () => {
    handler = (request) => {
      request.socket.destroy(new Error('private transport detail'));
    };
    await expect(service.transcribe(uploadWav(), 'zh-CN')).rejects.toMatchObject({
      status: 502,
      message: expect.not.stringMatching(/private transport|server-only-test-secret/),
    });
  });
});

describe('SpeechService timeout configuration', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it.each([
    ['', 120000],
    ['not-a-timeout', 120000],
    ['-10', 120000],
    ['0', 120000],
    ['2.5', 120000],
    ['Infinity', 120000],
    ['999999999999999999999', 120000],
    ['240000', 180000],
    ['100', 100],
  ])('bounds timeout %s to %s ms', async (configured, expectedMs) => {
    vi.useFakeTimers();
    vi.stubEnv('ASR_BASE_URL', 'http://127.0.0.1:1/v1');
    vi.stubEnv('ASR_MODEL', 'test-transcriber');
    vi.stubEnv('ASR_TIMEOUT_MS', configured);
    let aborted = false;
    vi.stubGlobal(
      'fetch',
      (_url: URL, options: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => {
            aborted = true;
            reject(new Error('aborted'));
          });
        }),
    );
    const pending = new SpeechService().transcribe(uploadWav(), 'mixed');
    const assertion = expect(pending).rejects.toMatchObject({ status: 504 });

    await vi.advanceTimersByTimeAsync(expectedMs - 1);
    expect(aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    expect(aborted).toBe(true);
  });
});
