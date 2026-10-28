import { z } from 'zod';
import {
  jobAnalyzeInputSchema,
  jobAnalysisSchema,
  storyInputSchema,
  structuredProfileSchema,
} from '@interview-assistant/contracts';
import { buildAnalysisPrompt } from '../index.js';
import type { AgentModelGateway } from './model-gateway.js';
import { structuredAgent } from './structured-agent.js';
import { evidenceStrings, validateEvidence } from '../validation/evidence.js';

export const jobAgentInputSchema = jobAnalyzeInputSchema.extend({
  resumeText: z.string(),
  stories: z.array(storyInputSchema),
  structuredProfile: structuredProfileSchema.optional(),
});
export type JobAgentInput = z.infer<typeof jobAgentInputSchema>;

export class JobAgent {
  readonly runnable;
  constructor(model: AgentModelGateway) {
    this.runnable = structuredAgent({
      name: 'JobAgent',
      taskType: 'job-analysis',
      model,
      input: jobAgentInputSchema,
      output: jobAnalysisSchema,
      maxOutputTokens: 2500,
      instructions:
        'Analyze the job against verified candidate facts. Include vue-react, ai-application, system-design and project-depth exactly once. Cite only verbatim supplied evidence.',
      context: ({ company, ...input }) =>
        buildAnalysisPrompt({ ...input, ...(company ? { company } : {}) }) +
        '\nVerified structured profile: ' +
        JSON.stringify(input.structuredProfile ?? null),
      validate: (output, input) => {
        if (
          new Set(output.competencies.map((item) => item.competency)).size !== 4 ||
          output.competencies.length !== 4
        )
          throw new Error('Job analysis must cover four distinct competencies');
        for (const item of output.competencies)
          validateEvidence(item.evidence, {
            resume: input.resumeText,
            job_description: input.jobDescription,
            history: evidenceStrings(input.stories),
          });
      },
    });
  }
  invoke(...args: Parameters<typeof this.runnable.invoke>) {
    return this.runnable.invoke(...args);
  }
}
