import { z } from 'zod';
import {
  coachingCueSchema,
  questionSchema,
  referenceAnswerSchema,
  rubricEvaluationSchema,
} from '@interview-assistant/contracts';
import { buildCoachingPrompt } from '../index.js';
import type { AgentModelGateway } from './model-gateway.js';
import { structuredAgent } from './structured-agent.js';
import { evidenceStrings, validateEvidence } from '../validation/evidence.js';
import { validateRubric } from '../validation/rubric.js';
import { feedbackForAssessment } from '../validation/feedback.js';

export const coachAgentInputSchema = z.object({
  sessionId: z.string(),
  language: z.string(),
  currentQuestion: questionSchema,
  answerText: z.string().min(1),
  profileSummary: z.string(),
  jobSummary: z.string(),
  priorCues: z.array(coachingCueSchema),
  allowFollowUp: z.boolean().optional(),
});
export type CoachAgentInput = z.infer<typeof coachAgentInputSchema>;

const coachOutputSchema = coachingCueSchema.extend({ referenceAnswer: referenceAnswerSchema });
// Each question advertises its required scoring input to the model. Keeping
// both fields optional hides the requirement until after generation.
const legacyCoachOutputSchema = coachOutputSchema.extend({ rubricEvaluation: z.null().optional() });
const rubricCoachOutputSchema = coachOutputSchema
  .omit({ score: true })
  .extend({ rubricEvaluation: rubricEvaluationSchema })
  .transform((cue) => ({
    ...cue,
    score: 1 + cue.rubricEvaluation.items.filter((item) => item.status === 'met').length,
  }));

const rubricInstructions =
  'This question has a rubricSnapshot. Return the required rubricEvaluation with the exact bankId, questionVersion and rubricVersion, and assess EVERY criterion exactly once. Use met only for sufficiently supported correct reasoning under the question constraints; missing for omitted information (quotes must be empty); incorrect for explicit errors; unclear for ambiguous statements. For every non-missing item quote the current answer verbatim, never the resume, rubric, or previous feedback. Give a concise reason for each judgment in the requested language. Omit the score: the application calculates 1 plus the count of met criteria.';
const legacyInstructions =
  'This question has no rubricSnapshot. Return the required score as an integer from 1 to 5 using the current answer assessment. Omit rubricEvaluation. These rules also apply to follow-up questions without a snapshot, even when prior questions used rubrics.';

const referenceAnswerInstructions =
  [
    'First assess the candidate answer against the supplied criteria and constraints only, then produce the required referenceAnswer as teaching material.',
    'Do not use the greater detail of your reference answer as an additional grading requirement. A concise answer that explains the relevant mechanism, handling strategy or validation scenario can satisfy a criterion; do not demand code, numeric results or implementation steps unless that criterion or question explicitly requires them. Distinguish absent evidence from a supported explanation that could be expanded.',
    'referenceAnswer must answer the CURRENT question, including follow-ups, in the requested language, with concrete reasoning and keyPoints rather than only advice.',
    'For personal-experience questions use kind experience-template and write an UNFILLED reusable answer template tailored to the question, not a completed personal story. Put ALL concrete projects, circumstances, actions, decisions, measurements and outcomes inside placeholders, even if the candidate already mentioned them; the candidate will fill in verified facts. Do not copy or extrapolate the candidate story. For example: 我在【项目与背景】中负责【个人职责】，通过【验证方法】观察到【实际结果，包括无改善或失败】，由此决定【后续行动】。 Connect these placeholders into a natural answer addressing this question, and list the facts to fill in missingFacts. No declarative success claims outside placeholders. Performing a test does not imply success.',
    'For general technical questions use kind example and missingFacts []. A reference answer is one possible approach, not evidence of candidate ability.',
  ].join(' ') + ' ';

export class CoachAgent {
  readonly runnable;
  constructor(model: AgentModelGateway) {
    this.runnable = structuredAgent({
      name: 'CoachAgent.reference-answer-v3',
      taskType: 'coaching',
      model,
      input: coachAgentInputSchema,
      output: (input) =>
        input.currentQuestion.rubricSnapshot ? rubricCoachOutputSchema : legacyCoachOutputSchema,
      maxOutputTokens: 4000,
      instructions: (input) =>
        referenceAnswerInstructions +
        'Evaluate only this answer and current competency using supplied facts. Cite exact quotes. Do not make hiring decisions or invent a score without evidence. Suggest a followUpQuestion only when clarification, verification or a deeper trade-off would materially change what is known. Omit it if the evidence is sufficient. Ask one targeted question grounded in the answer without revealing a solution; the application controls progression. Accept alternative valid solutions; length, keywords and STAR format alone are not evidence. Never invent candidate experience. ' +
        (input.currentQuestion.rubricSnapshot ? rubricInstructions : legacyInstructions),
      context: buildCoachingPrompt,
      validate: (output, input) => {
        validateRubric(output, input.currentQuestion, input.answerText);
        if (output.competency !== input.currentQuestion.competency)
          throw new Error('Feedback competency does not match the current question');
        if (
          input.currentQuestion.competency === 'project-depth' &&
          output.referenceAnswer?.kind !== 'experience-template'
        )
          throw new Error('Project experience requires an experience-template reference answer');
        validateEvidence(output.evidence, {
          resume: input.profileSummary,
          job_description: input.jobSummary,
          answer: input.answerText,
          history: evidenceStrings(input.priorCues.map(feedbackForAssessment)),
        });
      },
    });
  }
  invoke(...args: Parameters<typeof this.runnable.invoke>) {
    return this.runnable.invoke(...args);
  }
}
