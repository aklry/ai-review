import { z } from 'zod';
import { storyInputSchema, structuredProfileSchema } from '@interview-assistant/contracts';
import type { AgentModelGateway } from './model-gateway.js';
import { structuredAgent } from './structured-agent.js';
import { evidenceStrings, validateEvidence } from '../validation/evidence.js';

export const profileAgentInputSchema = z.object({
  resumeText: z.string().min(20),
  stories: z.array(storyInputSchema),
});
export type ProfileAgentInput = z.infer<typeof profileAgentInputSchema>;

export class ProfileAgent {
  readonly runnable;
  constructor(model: AgentModelGateway) {
    this.runnable = structuredAgent({
      name: 'ProfileAgent',
      taskType: 'profile-analysis',
      model,
      input: profileAgentInputSchema,
      output: structuredProfileSchema,
      maxOutputTokens: 2500,
      instructions:
        'Extract candidate skills and projects from confirmed facts. Never invent responsibilities, decisions or results. Cite verbatim resume or confirmed story evidence; list missing facts in missingEvidence.',
      context: (input) => JSON.stringify(input),
      validate: (output, input) => {
        const sources = { resume: input.resumeText, history: evidenceStrings(input.stories) };
        validateEvidence(output.evidence, sources);
        for (const project of output.projects) validateEvidence(project.evidence, sources);
      },
    });
  }
  invoke(...args: Parameters<typeof this.runnable.invoke>) {
    return this.runnable.invoke(...args);
  }
}
