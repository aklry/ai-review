import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  answerSubmitInputSchema,
  interviewSessionCreateInputSchema,
  jobAnalyzeInputSchema,
  profileInputSchema,
  storyInputSchema,
  sessionHistoryQuerySchema,
} from '@interview-assistant/contracts';
import { z } from 'zod';
import { InterviewService } from './interview.service.js';

@Controller()
export class InterviewController {
  constructor(private readonly interviewService: InterviewService) {}

  @Post('profiles')
  createProfile(@Body() body: unknown) {
    return this.interviewService.createProfile(profileInputSchema.parse(body));
  }

  @Post('jobs/analyze')
  analyzeJob(@Body() body: unknown) {
    return this.interviewService.analyzeJob(jobAnalyzeInputSchema.parse(body));
  }

  @Get('jobs/:id')
  getJob(@Param('id') jobId: string) {
    return this.interviewService.getJob(jobId);
  }

  @Post('stories/:profileId')
  createStory(@Param('profileId') profileId: string, @Body() body: unknown) {
    return this.interviewService.createStory(profileId, storyInputSchema.parse(body));
  }

  @Post('interview-sessions')
  createSession(@Body() body: unknown) {
    return this.interviewService.createSession(interviewSessionCreateInputSchema.parse(body));
  }

  @Get('interview-sessions')
  listSessions(@Query() query: unknown) {
    return this.interviewService.listSessions(sessionHistoryQuerySchema.parse(query));
  }

  @Get('interview-sessions/:id/review')
  getSessionReview(@Param('id') sessionId: string) {
    return this.interviewService.getSessionReview(sessionId);
  }

  @Post('interview-sessions/:id/answers')
  async submitAnswer(@Param('id') sessionId: string, @Body() body: unknown) {
    const turn = await this.interviewService.submitAnswer(
      sessionId,
      answerSubmitInputSchema.parse(body),
    );
    return turn.feedbackPolicy === 'deferred'
      ? {
          ...turn,
          cue: null,
          nextQuestion: turn.nextQuestion ? { ...turn.nextQuestion, rubricSnapshot: null } : null,
        }
      : turn;
  }

  @Post('interview-sessions/:id/control')
  control(@Param('id') id: string, @Body() body: unknown) {
    const { action, questionId, version } = z
      .object({
        action: z.enum(['skip', 'pause', 'resume']),
        questionId: z.string().min(1),
        version: z.number().int().nonnegative(),
      })
      .parse(body);
    return this.interviewService.control(id, action, questionId, version);
  }

  @Post('interview-sessions/:id/finish')
  finishSession(@Param('id') sessionId: string) {
    return this.interviewService.finishSession(sessionId);
  }

  @Get('interview-sessions/:id')
  getSession(@Param('id') sessionId: string) {
    return this.interviewService.getSession(sessionId);
  }

  @Get('reports/:sessionId')
  getReport(@Param('sessionId') sessionId: string) {
    return this.interviewService.getReport(sessionId);
  }
}
