import { z } from 'zod';
import {
  coachingCueSchema,
  competencyScoresSchema,
  reportNarrativeSchema,
} from '@interview-assistant/contracts';
import type { AgentModelGateway } from './model-gateway.js';
import { structuredAgent } from './structured-agent.js';
import { feedbackForAssessment } from '../validation/feedback.js';

export const reportAgentInputSchema = z.object({
  sessionId: z.string(),
  language: z.string(),
  profileSummary: z.string(),
  jobSummary: z.string(),
  cues: z.array(coachingCueSchema),
  feedbackPolicy: z.enum(['immediate', 'deferred']).optional(),
  supplementalCues: z.array(coachingCueSchema).default([]),
  competencyScores: competencyScoresSchema,
});
export type ReportAgentInput = z.infer<typeof reportAgentInputSchema>;

export class ReportAgent {
  readonly runnable;
  constructor(model: AgentModelGateway) {
    this.runnable = structuredAgent({
      name: 'ReportAgent',
      taskType: 'report',
      model,
      input: reportAgentInputSchema,
      output: reportNarrativeSchema,
      maxOutputTokens: 3000,
      instructions:
        'Summarize verified interview feedback in the requested language. Do not assign or alter scores. supplementalCues contain linked follow-up evidence: use them to qualify narrative gaps and strengths without treating them as separately scored questions. When feedbackPolicy is immediate, follow-up answers came after coaching and cannot establish independent mastery. Null competencies are unassessed, not weaknesses or passing grades. Separate facts from advice. Return an actionable plan with each day 1 through 7 exactly once. Never invent candidate experience.',
      context: (input) =>
        JSON.stringify({
          ...input,
          cues: input.cues.map(feedbackForAssessment),
          supplementalCues: input.supplementalCues.map(feedbackForAssessment),
        }),
    });
  }
  invoke(...args: Parameters<typeof this.runnable.invoke>) {
    return this.runnable.invoke(...args);
  }
}
