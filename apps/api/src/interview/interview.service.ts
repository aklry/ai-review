import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  answerSubmitInputSchema,
  coachingCueSchema,
  evaluationReportSchema,
  jobAnalysisSchema,
  jobAnalyzeInputSchema,
  profileInputSchema,
  questionSetSchema,
  storyInputSchema,
  type AnswerSubmitInput,
  type CoachingCue,
  type EvaluationReport,
  type InterviewQuestion,
  type InterviewSessionCreateInput,
  type JobAnalyzeInput,
  type ProfileInput,
  type StoryInput,
} from '@interview-assistant/contracts';
import {
  buildAnalysisPrompt,
  buildCoachingPrompt,
  buildQuestionPrompt,
  buildReportPrompt,
  calculateWeightedScore,
  normalizeCompetencyScores,
} from '@interview-assistant/agent-core';
import { DeepSeekProvider } from '../deepseek/deepseek.provider.js';
import { InterviewRepository } from './interview.repository.js';

@Injectable()
export class InterviewService {
  constructor(
    private readonly repository: InterviewRepository,
    private readonly provider: DeepSeekProvider,
  ) {}

  createProfile(input: ProfileInput) {
    return this.repository.createProfile(profileInputSchema.parse(input));
  }

  async analyzeJob(input: JobAnalyzeInput) {
    const validInput = jobAnalyzeInputSchema.parse(input);
    const existingJob = await this.repository.findJobByInput(validInput);
    if (existingJob) {
      return existingJob;
    }

    const job = await this.repository.createProcessingJob(validInput);
    void this.runJobAnalysis(job.id, validInput).catch((error: unknown) => {
      console.error(`[job-analysis] failed for ${job.id}: ${getErrorMessage(error)}`);
    });

    return job;
  }

  getJob(jobId: string) {
    return this.repository.getJob(jobId);
  }

  createStory(profileId: string, input: StoryInput) {
    return this.repository.createStory(profileId, storyInputSchema.parse(input));
  }

  async createSession(input: InterviewSessionCreateInput) {
    const profile = await this.repository.getProfile(input.profileId);
    const job = await this.repository.getJob(input.jobId);
    if (job.analysisStatus !== 'completed' || !job.analysis) {
      throw new BadRequestException('Job analysis is not ready yet');
    }

    const validInput = {
      ...input,
      questionCount: input.questionCount ?? 8,
    };
    const result = await this.provider.generateJson({
      taskType: 'question-generation',
      schema: questionSetSchema,
      systemPrompt: 'Return JSON only for question generation.',
      userPrompt: buildQuestionPrompt({
        targetRole: job.targetRole,
        ...(job.company ? { company: job.company } : {}),
        language: validInput.language,
        round: validInput.round,
        difficulty: validInput.difficulty,
        questionCount: validInput.questionCount,
        jobAnalysis: job.analysis,
        profileSummary: profile.resumeText,
        stories: toStories(profile.stories),
      }),
    });
    await this.recordUsage('local-user', undefined, result);
    const questions = ensureQuestionCount(result.data.questions, validInput.questionCount);
    return this.repository.createSession(validInput, questions);
  }

  async submitAnswer(sessionId: string, input: AnswerSubmitInput) {
    const validInput = answerSubmitInputSchema.parse(input);
    const session = await this.repository.getSession(sessionId);
    const currentQuestion = session.questions.find(
      (question) => question.id === validInput.questionId,
    );
    if (!currentQuestion) {
      throw new NotFoundException('Question not found in this session');
    }

    const priorCues = session.cues.map(toCoachingCue);
    const result = await this.provider.generateJson({
      taskType: 'coaching',
      schema: coachingCueSchema,
      systemPrompt: 'Return JSON only for coaching feedback.',
      userPrompt: buildCoachingPrompt({
        sessionId,
        language: session.plan.language,
        currentQuestion,
        answerText: validInput.answerText,
        profileSummary: session.plan.profile.resumeText,
        jobSummary: session.plan.job.description,
        priorCues,
      }),
    });
    await this.recordUsage('local-user', sessionId, result);
    await this.repository.saveAnswerFeedback({
      sessionId,
      questionId: validInput.questionId,
      answerText: validInput.answerText,
      cue: result.data,
    });

    const nextQuestion = result.data.followUpQuestion
      ? {
          id: `followup-${sessionId}-${session.currentQuestionIndex}`,
          competency: result.data.competency,
          difficulty: currentQuestion.difficulty,
          prompt: result.data.followUpQuestion,
          isCore: false,
        }
      : (session.questions[session.currentQuestionIndex + 1] ?? null);
    if (nextQuestion?.id.startsWith('followup-')) {
      await this.repository.createFollowUpQuestion(
        sessionId,
        nextQuestion,
        1_000 + session.currentQuestionIndex,
      );
    }

    return {
      cue: result.data,
      nextQuestion,
      degraded: result.degraded,
      model: result.model,
    };
  }

  async finishSession(sessionId: string) {
    const session = await this.repository.getSession(sessionId);
    const cues = session.cues.map(toCoachingCue);
    const result = await this.provider.generateJson({
      taskType: 'report',
      schema: evaluationReportSchema,
      systemPrompt: 'Return JSON only for the evaluation report.',
      userPrompt: buildReportPrompt({
        sessionId,
        language: session.plan.language,
        profileSummary: session.plan.profile.resumeText,
        jobSummary: session.plan.job.description,
        cues,
      }),
    });
    await this.recordUsage('local-user', sessionId, result);

    const competencyScores = normalizeCompetencyScores(cues);
    const report: EvaluationReport = {
      ...result.data,
      cues,
      competencyScores,
      overallScore: calculateWeightedScore(competencyScores),
    };
    return this.repository.finishSession(sessionId, report);
  }

  getSession(sessionId: string) {
    return this.repository.getSession(sessionId);
  }

  getReport(sessionId: string) {
    return this.repository.getReport(sessionId);
  }

  private async runJobAnalysis(jobId: string, input: JobAnalyzeInput): Promise<void> {
    try {
      const profile = await this.repository.getProfile(input.profileId);
      const result = await this.provider.generateJson({
        taskType: 'job-analysis',
        schema: jobAnalysisSchema,
        systemPrompt: 'Return JSON only for job analysis.',
        userPrompt: buildAnalysisPrompt({
          ...input,
          resumeText: profile.resumeText,
          stories: toStories(profile.stories),
        }),
        maxOutputTokens: 2_000,
      });
      await this.recordUsage('local-user', undefined, result);
      await this.repository.updateJobAnalysis(jobId, result.data);
    } catch (error) {
      await this.repository.markJobAnalysisFailed(jobId, getErrorMessage(error));
      throw error;
    }
  }

  private async recordUsage(
    userKey: string,
    sessionId: string | undefined,
    result: {
      model: string;
      degraded: boolean;
      usage: {
        inputTokens: number;
        outputTokens: number;
        cachedInputTokens: number;
      };
    },
  ): Promise<void> {
    const price = getModelPrice(result.model);
    await this.repository.recordUsage({
      userKey,
      model: result.model,
      taskType: 'agent',
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cachedInputTokens: result.usage.cachedInputTokens,
      degraded: result.degraded,
      estimatedCostCny:
        ((result.usage.inputTokens - result.usage.cachedInputTokens) * price.input +
          result.usage.cachedInputTokens * price.cachedInput +
          result.usage.outputTokens * price.output) /
        1_000_000,
      ...(sessionId ? { sessionId } : {}),
    });
  }
}

function toStories(stories: Array<Record<string, unknown>>): StoryInput[] {
  return stories.map((story) => storyInputSchema.parse(story));
}

function toCoachingCue(cue: Record<string, unknown>): CoachingCue {
  return coachingCueSchema.parse({
    competency: cue.competency,
    score: cue.score,
    strengths: cue.strengths,
    gaps: cue.gaps,
    nextAction: cue.nextAction,
    evidence: cue.evidence,
    ...(cue.followUpQuestion ? { followUpQuestion: cue.followUpQuestion } : {}),
  });
}

function ensureQuestionCount(questions: InterviewQuestion[], count: number): InterviewQuestion[] {
  if (questions.length < count) {
    throw new BadRequestException(
      `DeepSeek returned ${questions.length} questions; ${count} required`,
    );
  }
  return questions.slice(0, count).map((question, index) => ({
    ...question,
    id: question.id || `question_${index + 1}`,
  }));
}

function getModelPrice(model: string): {
  cachedInput: number;
  input: number;
  output: number;
} {
  if (model.includes('flash')) {
    return { cachedInput: 0.014, input: 0.44, output: 1.32 };
  }
  return { cachedInput: 0.044, input: 1.32, output: 3.96 };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
