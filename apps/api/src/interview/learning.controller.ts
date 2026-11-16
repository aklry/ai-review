import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  learningAnswerSchema,
  learningListQuerySchema,
  learningUpdateSchema,
} from '@interview-assistant/contracts';
import { LearningService } from './learning.service.js';

@Controller('learning')
export class LearningController {
  constructor(private readonly learning: LearningService) {}
  @Post('daily') daily() {
    return this.learning.daily();
  }
  @Get('items') list(@Query() query: unknown) {
    const input = learningListQuerySchema.parse(query);
    return this.learning.list(input.filter, input.page);
  }
  @Get('items/:id') get(@Param('id') id: string) {
    return this.learning.get(id);
  }
  @Patch('items/:id') update(@Param('id') id: string, @Body() body: unknown) {
    const input = learningUpdateSchema.parse(body);
    return this.learning.update(id, {
      ...(input.bookmarked !== undefined ? { bookmarked: input.bookmarked } : {}),
      ...(input.reviewStatus !== undefined ? { reviewStatus: input.reviewStatus } : {}),
    });
  }
  @Post('items/:id/answers') answer(@Param('id') id: string, @Body() body: unknown) {
    return this.learning.answer(id, learningAnswerSchema.parse(body));
  }
  @Post('import/:questionId') importQuestion(@Param('questionId') id: string) {
    return this.learning.importQuestion(id);
  }
}
