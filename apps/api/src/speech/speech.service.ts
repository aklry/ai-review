import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { interviewLanguageSchema, speechTranscriptionSchema } from '@interview-assistant/contracts';
import { MAX_AUDIO_BYTES, inspectWav } from './wav.js';

export type SpeechUploadFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 180_000;

@Injectable()
export class SpeechService {
  async transcribe(
    file: SpeechUploadFile | undefined,
    language: unknown,
  ): Promise<{ text: string }> {
    if (!file?.buffer?.byteLength) {
      throw new BadRequestException('请上传 PCM WAV 录音文件');
    }
    if (file.buffer.byteLength > MAX_AUDIO_BYTES) {
      throw new PayloadTooLargeException('录音文件不能超过 6 MB');
    }

    const parsedLanguage = interviewLanguageSchema.safeParse(language);
    if (!parsedLanguage.success) {
      throw new BadRequestException('转写语言无效');
    }

    inspectWav(file.buffer);
    const config = getConfig();
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, config.timeoutMs);

    try {
      const form = new FormData();
      form.set(
        'file',
        new Blob([Uint8Array.from(file.buffer)], { type: 'audio/wav' }),
        'answer.wav',
      );
      form.set('model', config.model);
      if (parsedLanguage.data !== 'mixed') {
        form.set('language', parsedLanguage.data === 'zh-CN' ? 'zh' : 'en');
      }

      const response = await fetch(
        new URL('audio/transcriptions', `${config.baseUrl.replace(/\/+$/, '')}/`),
        {
          method: 'POST',
          ...(config.apiKey ? { headers: { Authorization: `Bearer ${config.apiKey}` } } : {}),
          body: form,
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        throw new BadGatewayException('语音转写服务暂时不可用');
      }

      let result: unknown;
      try {
        result = await response.json();
      } catch {
        throw new BadGatewayException('语音转写服务返回了无效结果');
      }
      const transcription = speechTranscriptionSchema.safeParse(result);
      if (!transcription.success) {
        throw new BadGatewayException('语音转写服务没有返回有效文本');
      }

      return transcription.data;
    } catch (error) {
      if (timedOut) throw new GatewayTimeoutException('语音转写超时，请稍后重试');
      if (error instanceof BadGatewayException) throw error;
      throw new BadGatewayException('语音转写服务暂时不可用');
    } finally {
      clearTimeout(timer);
    }
  }
}

function getConfig(): { baseUrl: string; model: string; apiKey: string; timeoutMs: number } {
  const model = process.env.ASR_MODEL?.trim() ?? '';
  const rawBaseUrl = process.env.ASR_BASE_URL?.trim() ?? '';
  const apiKey = process.env.ASR_API_KEY?.trim() ?? '';
  const parsedUrl = parseBaseUrl(rawBaseUrl);
  if (!model || !parsedUrl) {
    throw new ServiceUnavailableException('语音转写服务未配置');
  }

  return { baseUrl: parsedUrl, model, apiKey, timeoutMs: parseTimeout(process.env.ASR_TIMEOUT_MS) };
}

function parseBaseUrl(value: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:') ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return undefined;
    }
    return url.toString().replace(/\/+$/, '');
  } catch {
    return undefined;
  }
}

function parseTimeout(value: string | undefined): number {
  if (!value) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return DEFAULT_TIMEOUT_MS;
  return Math.min(parsed, MAX_TIMEOUT_MS);
}
