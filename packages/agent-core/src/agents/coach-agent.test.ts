import { describe, expect, it } from 'vitest';
import { CoachAgent, type CoachAgentInput } from './coach-agent.js';
import type { AgentModelGateway, AgentRequest } from './model-gateway.js';
import { parseModelJson } from '../index.js';
import { snapshotFor, topics } from '../question-bank/catalog.js';

const topic = topics[0]!;
const snapshot = snapshotFor(topic, 'l2');
const input: CoachAgentInput = {
  sessionId: 'schema-regression',
  language: 'zh-CN',
  currentQuestion: {
    id: 'q1',
    competency: topic.competency,
    difficulty: 'l2',
    prompt: topic.prompt,
    isCore: true,
    rubricSnapshot: snapshot,
  },
  answerText: topic.examples.join(''),
  profileSummary: '',
  jobSummary: '',
  priorCues: [],
};
const feedback = {
  competency: topic.competency,
  strengths: ['Supported reasoning'],
  gaps: ['Validation missing'],
  nextAction: 'Explain how you would verify this.',
  evidence: [{ source: 'answer', quote: topic.examples[0] }],
  referenceAnswer: {
    kind: 'example',
    content: 'Trace dependencies and verify the resulting update.',
    keyPoints: ['Dependencies', 'Validation'],
    missingFacts: [],
  },
};
const rubricEvaluation = {
  bankId: snapshot.bankId,
  questionVersion: snapshot.questionVersion,
  rubricVersion: snapshot.rubricVersion,
  items: snapshot.criteria.map((criterion, index) => ({
    criterionId: criterion.id,
    status: index < 3 ? 'met' : 'missing',
    reason: 'Criterion assessment',
    quotes: index < 3 ? [topic.examples[index]!] : [],
  })),
};

function formatSchema(request: AgentRequest<unknown>) {
  const block = request.systemPrompt.match(/```json\s*([\s\S]*?)```/);
  return JSON.parse(block![1]!) as { required: string[]; properties: Record<string, unknown> };
}

function modelReturning(output: (request: AgentRequest<unknown>) => unknown): AgentModelGateway {
  return {
    async generateJson(request) {
      return {
        data: parseModelJson(request.schema, JSON.stringify(output(request))),
        model: 'fixture',
        degraded: false,
        usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
      };
    },
  };
}

describe('coaching output requirements', () => {
  it('requires rubric feedback in the prompt and calculates a score without a model score', async () => {
    const coach = new CoachAgent(
      modelReturning((request) => {
        const schema = formatSchema(request);
        expect(schema.required).toContain('rubricEvaluation');
        expect(schema.properties).not.toHaveProperty('score');
        return { ...feedback, rubricEvaluation };
      }),
    );
    await expect(coach.invoke(input)).resolves.toMatchObject({ data: { score: 4 } });
  });

  it.each([undefined, null])(
    'requires a score for questions without a snapshot (%s)',
    async (snapshot) => {
      const coach = new CoachAgent(
        modelReturning((request) => {
          expect(formatSchema(request).required).toContain('score');
          expect(request.systemPrompt).not.toContain('Omit the score');
          return { ...feedback, score: 3 };
        }),
      );
      await expect(
        coach.invoke({
          ...input,
          currentQuestion: {
            ...input.currentQuestion,
            rubricSnapshot: snapshot,
            parentQuestionId: 'base',
          },
        }),
      ).resolves.toMatchObject({ data: { score: 3 } });
    },
  );

  it('reports missing rubric feedback instead of requesting an invented score', async () => {
    const coach = new CoachAgent(modelReturning(() => feedback));
    await expect(coach.invoke(input)).rejects.toThrow(/rubricEvaluation/);
  });

  it('does not accept a model score in place of required rubric feedback', async () => {
    const coach = new CoachAgent(modelReturning(() => ({ ...feedback, score: 4 })));
    await expect(coach.invoke(input)).rejects.toThrow(/rubricEvaluation/);
  });

  it.each([undefined, 0, 6, 2.5])('rejects an invalid legacy score (%s)', async (score) => {
    const coach = new CoachAgent(modelReturning(() => ({ ...feedback, score })));
    await expect(
      coach.invoke({
        ...input,
        currentQuestion: { ...input.currentQuestion, rubricSnapshot: null },
      }),
    ).rejects.toThrow(/score/);
  });
});
