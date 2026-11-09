import { Body, Controller, Inject, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { SpeechService, type SpeechUploadFile } from './speech.service.js';
import { SpeechUploadInterceptor } from './speech-upload.interceptor.js';

@Controller('speech')
export class SpeechController {
  constructor(@Inject(SpeechService) private readonly speechService: SpeechService) {}

  @Post('transcriptions')
  @UseInterceptors(SpeechUploadInterceptor)
  transcribe(
    @UploadedFile() file: SpeechUploadFile | undefined,
    @Body('language') language: string | undefined,
  ) {
    return this.speechService.transcribe(file, language);
  }
}
