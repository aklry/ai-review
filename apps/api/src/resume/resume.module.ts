import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MinioStorageService } from '../storage/minio-storage.service.js';
import { ResumeController } from './resume.controller.js';
import { ResumeParserService } from './resume-parser.service.js';
import { ResumeRepository } from './resume.repository.js';
import {
  RESUME_PARSER,
  RESUME_REPOSITORY,
  RESUME_STORAGE,
  ResumeService,
} from './resume.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [ResumeController],
  providers: [
    ResumeService,
    {
      provide: RESUME_REPOSITORY,
      useFactory: (prisma: PrismaService) => new ResumeRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: RESUME_STORAGE,
      useFactory: () => new MinioStorageService(),
    },
    {
      provide: RESUME_PARSER,
      useFactory: () => new ResumeParserService(),
    },
  ],
  exports: [ResumeService],
})
export class ResumeModule {}
