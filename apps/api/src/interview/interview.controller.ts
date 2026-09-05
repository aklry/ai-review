import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  answerSubmitInputSchema,
  interviewSessionCreateInputSchema,
  jobAnalyzeInputSchema,
  profileInputSchema,
  storyInputSchema,
} from '@interview-assistant/contracts';
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

  @Post('interview-sessions/:id/answers')
  submitAnswer(@Param('id') sessionId: string, @Body() body: unknown) {
    return this.interviewService.submitAnswer(sessionId, answerSubmitInputSchema.parse(body));
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
