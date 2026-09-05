import { Body, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ResumeService } from './resume.service.js';
import type { ResumeUploadFile } from './resume-parser.service.js';

@Controller()
export class ResumeController {
  constructor(private readonly resumeService: ResumeService) {}

  @Post('profiles/resume')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: getMaxResumeBytes(),
      },
    }),
  )
  uploadResume(
    @UploadedFile() file: ResumeUploadFile | undefined,
    @Body('displayName') displayName?: string,
  ) {
    return this.resumeService.uploadResume(file, displayName);
  }
}

function getMaxResumeBytes(): number {
  const configuredMb = Number(process.env.RESUME_MAX_FILE_MB ?? 10);
  const maxMb = Number.isFinite(configuredMb) && configuredMb > 0 ? configuredMb : 10;
  return Math.floor(maxMb * 1024 * 1024);
}
