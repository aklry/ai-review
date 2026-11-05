import { z } from 'zod';
import {
  coachingCueSchema,
  questionSchema,
  questionSetSchema,
  storyInputSchema,
} from '@interview-assistant/contracts';
import type { InterviewQuestion } from '@interview-assistant/contracts';
import { buildQuestionPrompt } from '../index.js';
import type { AgentModelGateway } from './model-gateway.js';
import { structuredAgent } from './structured-agent.js';
import { feedbackForAssessment } from '../validation/feedback.js';

export const questionAgentInputSchema = z.object({
  targetRole: z.string(),
  company: z.string().optional(),
  language: z.string(),
  round: z.string(),
  difficulty: z.string(),
  questionCount: z.number().int().min(1).max(12),
  jobAnalysis: z.unknown(),
  profileSummary: z.string(),
  stories: z.array(storyInputSchema),
  standardQuestions: z.boolean().optional(),
});
export type QuestionAgentInput = z.infer<typeof questionAgentInputSchema>;
export const followUpInputSchema = z.object({
  currentQuestion: questionSchema,
  answerText: z.string().min(1),
  language: z.string(),
  cue: coachingCueSchema,
});

export class InterviewerAgent {
  readonly runnable;
  readonly followUp;
  constructor(model: AgentModelGateway) {
    this.runnable = structuredAgent({
      name: 'InterviewerAgent',
      taskType: 'question-generation',
      model,
      input: questionAgentInputSchema,
      output: questionSetSchema,
      instructions:
        'Generate the requested number of questions using the supplied per-question template. Replace only each prompt with a concrete interview question; preserve competency, difficulty, isCore and order. For 8 questions use competency counts 1 vue-react, 2 ai-application, 2 system-design, 3 project-depth. For 4 or more questions cover all four competencies with at least one core question each. Do not invent candidate facts.',
      context: ({ company, ...input }) =>
        buildQuestionPrompt({
          ...input,
          jobAnalysis: input.jobAnalysis,
          ...(company ? { company } : {}),
        }),
      validate: (output, input) => validateQuestions(output.questions, input.questionCount),
    });
    this.followUp = structuredAgent({
      name: 'InterviewerAgent.followUp',
      taskType: 'follow-up',
      model,
      input: followUpInputSchema,
      output: z.object({ question: questionSchema }),
      maxOutputTokens: 600,
      instructions:
        'Generate exactly one concise follow-up clarifying the candidate actual answer. Keep the current competency and difficulty. isCore must be false. The application controls progression; never request another follow-up.',
      context: (input) => JSON.stringify({ ...input, cue: feedbackForAssessment(input.cue) }),
      validate: (output, input) => {
        if (output.question.competency !== input.currentQuestion.competency)
          throw new Error('Follow-up competency changed');
      },
    });
  }
  invoke(...args: Parameters<typeof this.runnable.invoke>) {
    return this.runnable.invoke(...args);
  }
}

function validateQuestions(questions: InterviewQuestion[], count: number): void {
  if (questions.length !== count) throw new Error(`Question count must be ${count}`);
  const competencies = ['vue-react', 'ai-application', 'system-design', 'project-depth'] as const;
  if (count >= 4)
    for (const competency of competencies) {
      if (!questions.some((q) => q.competency === competency && q.isCore))
        throw new Error(`Missing core competency coverage: ${competency}`);
    }
  if (count === 8) {
    const quotas = [1, 2, 2, 3];
    competencies.forEach((competency, index) => {
      if (questions.filter((q) => q.competency === competency).length !== quotas[index])
        throw new Error(`Invalid competency coverage: ${competency}`);
    });
  }
}
