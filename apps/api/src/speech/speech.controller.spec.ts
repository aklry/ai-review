import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiExceptionFilter } from '../common/http/api-exception.filter.js';
import { ApiResponseInterceptor } from '../common/http/api-response.interceptor.js';
import { SpeechModule } from './speech.module.js';
import { SpeechService } from './speech.service.js';
import { createWav } from './wav.test-fixture.js';

describe('POST /api/speech/transcriptions', () => {
  let app: INestApplication;
  let address: string;
  let transcribe: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    transcribe = vi.fn(async () => ({ text: 'recognized words' }));
    const moduleRef = await Test.createTestingModule({ imports: [SpeechModule] })
      .overrideProvider(SpeechService)
      .useValue({ transcribe })
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalInterceptors(new ApiResponseInterceptor());
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.listen(0, '127.0.0.1');
    const socketAddress = app.getHttpServer().address();
    if (!socketAddress || typeof socketAddress === 'string')
      throw new Error('Missing test server address');
    address = `http://127.0.0.1:${socketAddress.port}`;
  });

  afterEach(async () => app.close());

  it('accepts WAV multipart and returns the transcription in the shared response envelope', async () => {
    const form = new FormData();
    form.set('file', new Blob([new Uint8Array(createWav())], { type: 'audio/wav' }), 'answer.wav');
    form.set('language', 'zh-CN');
    const response = await fetch(`${address}/api/speech/transcriptions`, {
      method: 'POST',
      body: form,
    });

    const result = await response.json();
    expect({ status: response.status, result }).toMatchObject({
      status: 201,
      result: { code: 0, message: 'ok', data: { text: 'recognized words' } },
    });
    expect(transcribe).toHaveBeenCalledWith(expect.anything(), 'zh-CN');
  });

  it('returns a clear 413 error when uploaded audio exceeds 6 MB', async () => {
    const form = new FormData();
    form.set(
      'file',
      new Blob([new Uint8Array(6 * 1024 * 1024 + 1)], { type: 'audio/wav' }),
      'answer.wav',
    );
    form.set('language', 'zh-CN');
    const response = await fetch(`${address}/api/speech/transcriptions`, {
      method: 'POST',
      body: form,
    });
    const result = (await response.json()) as { code: number; message: string };

    expect(response.status).toBe(413);
    expect(result.code).toBe(413);
    expect(result.message).toContain('6 MB');
    expect(transcribe).not.toHaveBeenCalled();
  });
});
