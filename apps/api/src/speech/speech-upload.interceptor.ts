import {
  Injectable,
  PayloadTooLargeException,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Observable } from 'rxjs';
import { MAX_AUDIO_BYTES } from './wav.js';

const MultipartFileInterceptor = FileInterceptor('file', {
  limits: { fileSize: MAX_AUDIO_BYTES, files: 1, fields: 1, parts: 2 },
});

@Injectable()
export class SpeechUploadInterceptor implements NestInterceptor {
  private readonly fileInterceptor = new MultipartFileInterceptor();

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    try {
      return await this.fileInterceptor.intercept(context, next);
    } catch (error) {
      if (error instanceof PayloadTooLargeException || isFileSizeLimitError(error)) {
        throw new PayloadTooLargeException('录音文件不能超过 6 MB');
      }
      throw error;
    }
  }
}

function isFileSizeLimitError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'LIMIT_FILE_SIZE'
  );
}
