import { Body, Controller, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { PracticeService } from './practice.service.js';

@Controller()
export class PracticeController {
  constructor(private readonly service: PracticeService) {}
  @Post('questions/:id/practice')
  start(@Param('id') id: string, @Body() body: unknown) {
    return this.service.start(
      id,
      z.object({ criterionId: z.string().min(1) }).parse(body).criterionId,
    );
  }
  @Post('practice/:id/answers')
  answer(@Param('id') id: string, @Body() body: unknown) {
    const { stage, answerText } = z
      .object({
        stage: z.number().int().min(0).max(2),
        answerText: z.string().trim().min(1).max(20000),
      })
      .parse(body);
    return this.service.answer(id, stage, answerText);
  }
  @Post('questions/:id/reference-view')
  markReferenceViewed(@Param('id') id: string) {
    return this.service.markReferenceViewed(id);
  }
  @Post('questions/:id/score-dispute')
  dispute(@Param('id') id: string, @Body() body: unknown) {
    return this.service.dispute(
      id,
      z.object({ reason: z.string().trim().min(1).max(1000) }).parse(body).reason,
    );
  }
}
