import { z } from 'zod';
import { coachingCueSchema, questionSchema } from '@interview-assistant/contracts';
import { buildCoachingPrompt } from '../index.js';
import type { AgentModelGateway } from './model-gateway.js';
import { structuredAgent } from './structured-agent.js';
import { evidenceStrings, validateEvidence } from '../validation/evidence.js';

export const coachAgentInputSchema = z.object({
  sessionId: z.string(),
  language: z.string(),
  currentQuestion: questionSchema,
  answerText: z.string().min(1),
  profileSummary: z.string(),
  jobSummary: z.string(),
  priorCues: z.array(coachingCueSchema),
});
export type CoachAgentInput = z.infer<typeof coachAgentInputSchema>;

export class CoachAgent {
  readonly runnable;
  constructor(model: AgentModelGateway) {
    this.runnable = structuredAgent({
      name: 'CoachAgent',
      taskType: 'coaching',
      model,
      input: coachAgentInputSchema,
      output: coachingCueSchema,
      maxOutputTokens: 1500,
      instructions:
        'Evaluate only this answer and current competency using supplied facts. Cite exact quotes. Do not make hiring decisions or invent a score without evidence. A suggested followUpQuestion is optional; the application decides whether it is allowed.',
      context: buildCoachingPrompt,
      validate: (output, input) => {
        if (output.competency !== input.currentQuestion.competency)
          throw new Error('Feedback competency does not match the current question');
        validateEvidence(output.evidence, {
          resume: input.profileSummary,
          job_description: input.jobSummary,
          answer: input.answerText,
          history: evidenceStrings(input.priorCues),
        });
      },
    });
  }
  invoke(...args: Parameters<typeof this.runnable.invoke>) {
    return this.runnable.invoke(...args);
  }
}
