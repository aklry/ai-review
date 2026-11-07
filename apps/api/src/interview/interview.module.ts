import { Module } from '@nestjs/common';
import { DeepSeekProvider } from '../deepseek/deepseek.provider.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { InterviewController } from './interview.controller.js';
import { InterviewRepository } from './interview.repository.js';
import { InterviewService } from './interview.service.js';
import { WorkflowRuntime } from '../agents/workflow-runtime.service.js';

import { PracticeService } from './practice.service.js';
import { PracticeController } from './practice.controller.js';

@Module({
  imports: [PrismaModule],
  controllers: [InterviewController, PracticeController],
  providers: [
    {
      provide: DeepSeekProvider,
      useFactory: () => new DeepSeekProvider(),
    },
    {
      provide: InterviewRepository,
      useFactory: (prisma: PrismaService) => new InterviewRepository(prisma),
      inject: [PrismaService],
    },
    PracticeService,
    InterviewService,
    WorkflowRuntime,
  ],
})
export class InterviewModule {}
