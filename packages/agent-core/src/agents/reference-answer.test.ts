import { describe, expect, it } from 'vitest';
import { coachingCueSchema, type CoachingCue } from '@interview-assistant/contracts';
import { CoachAgent } from './coach-agent.js';
import { InterviewerAgent } from './interviewer-agent.js';
import type { AgentModelGateway } from './model-gateway.js';
import { buildCoachingPrompt, buildReportPrompt } from '../index.js';

const referenceAnswer = {
  kind: 'experience-template' as const,
  content: 'I implemented [verified personal contribution] and measured [actual results].',
  keyPoints: ['Personal ownership', 'Validation'],
  missingFacts: ['Actual results'],
};
const cue: CoachingCue = {
  competency: 'project-depth',
  score: 2,
  strengths: [],
  gaps: ['Validation missing'],
  nextAction: 'Explain how you verified it.',
  evidence: [{ source: 'answer', quote: 'I built the page.' }],
  referenceAnswer,
};
const input = {
  sessionId: 's1',
  language: 'en-US',
  currentQuestion: {
    id: 'q1',
    competency: 'project-depth' as const,
    difficulty: 'l2' as const,
    prompt: 'Describe your contribution.',
    isCore: true,
  },
  answerText: 'I built the page.',
  profileSummary: '',
  jobSummary: '',
  priorCues: [],
};
function model(output: unknown, prompts: string[] = []): AgentModelGateway {
  return {
    async generateJson(request) {
      prompts.push(request.userPrompt);
      return {
        data: request.schema.parse(output),
        model: 'fixture',
        degraded: false,
        usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
      };
    },
  };
}

describe('reference answer generation and evidence boundaries', () => {
  it('requires a reference answer for new generation while preserving legacy reads', async () => {
    const legacy = { ...cue };
    delete legacy.referenceAnswer;
    expect(coachingCueSchema.parse(legacy).referenceAnswer).toBeUndefined();
    expect(
      coachingCueSchema.parse({ ...legacy, referenceAnswer: null }).referenceAnswer,
    ).toBeNull();
    await expect(new CoachAgent(model(legacy)).invoke(input)).rejects.toThrow(/referenceAnswer/);
    await expect(
      new CoachAgent(
        model({ ...cue, referenceAnswer: { ...referenceAnswer, content: ' ' } }),
      ).invoke(input),
    ).rejects.toThrow();
    await expect(new CoachAgent(model(cue)).invoke(input)).resolves.toMatchObject({
      data: { referenceAnswer, score: 2 },
    });
  });

  it('requires an experience template for personal project questions including follow-ups', async () => {
    await expect(
      new CoachAgent(
        model({ ...cue, referenceAnswer: { ...referenceAnswer, kind: 'example' } }),
      ).invoke(input),
    ).rejects.toThrow(/experience-template/);
    await expect(
      new CoachAgent(model(cue)).invoke({
        ...input,
        currentQuestion: { ...input.currentQuestion, parentQuestionId: 'root', isCore: false },
      }),
    ).resolves.toMatchObject({ data: { referenceAnswer } });
  });

  it('does not accept reference material as evidence in later answers', async () => {
    const contaminated = {
      ...cue,
      evidence: [{ source: 'history', quote: referenceAnswer.content }],
    };
    await expect(
      new CoachAgent(model(contaminated)).invoke({ ...input, priorCues: [cue] }),
    ).rejects.toThrow(/Ungrounded/);
    const prompt = buildCoachingPrompt({ ...input, priorCues: [cue] });
    expect(prompt).not.toContain(referenceAnswer.content);
    expect(prompt).toContain(input.answerText);
    expect(buildReportPrompt({ ...input, cues: [cue] })).not.toContain(referenceAnswer.content);
  });

  it('keeps generated examples out of the follow-up question context', async () => {
    const prompts: string[] = [];
    await new InterviewerAgent(
      model(
        {
          question: { ...input.currentQuestion, isCore: false, prompt: 'How did you measure it?' },
        },
        prompts,
      ),
    ).followUp.invoke({ ...input, cue });
    expect(prompts[0]).not.toContain(referenceAnswer.content);
    expect(prompts[0]).toContain(input.answerText);
  });
});
