import { describe, expect, it, vi } from 'vitest';
import { coachingCueSchema, rubricSnapshotSchema } from '@interview-assistant/contracts';
import { topics, rubricSamples, snapshotFor } from './catalog.js';
import { practicePrompts } from './practice.js';
import { selectStandardQuestions } from './selection.js';
import { validateRubric } from '../validation/rubric.js';
import { CoachAgent } from '../agents/coach-agent.js';
import { InterviewWorkflows } from '../workflows/interview-workflows.js';
import type { AgentModelGateway } from '../agents/model-gateway.js';
import { MemorySaver } from '@langchain/langgraph';

const input = {
  questionCount: 8,
  difficulty: 'l2',
  round: 'technical',
  language: 'zh-CN',
  profileSummary: 'React engineer working on RAG',
  jobAnalysis: {},
};
const topic = topics[0]!;
const snapshot = snapshotFor(topic, 'l2');
const question = {
  id: 'persisted-question',
  competency: topic.competency,
  difficulty: 'l2' as const,
  prompt: topic.prompt,
  isCore: true,
  rubricSnapshot: snapshot,
};
const answer = topic.examples.join('');
const validCue = () =>
  coachingCueSchema.parse({
    competency: topic.competency,
    score: 4,
    strengths: ['Three supported criteria'],
    gaps: ['Verification missing'],
    nextAction: 'Explain validation',
    referenceAnswer: {
      kind: 'example',
      content: 'Trace the state update and validate rendering with a reproducible test.',
      keyPoints: ['Trace dependencies', 'Verify the rendered output'],
      missingFacts: [],
    },
    evidence: [{ source: 'answer', quote: topic.examples[0] }],
    rubricEvaluation: {
      bankId: snapshot.bankId,
      questionVersion: snapshot.questionVersion,
      rubricVersion: 'rubric-v3',
      items: snapshot.criteria.map((criterion, i) => ({
        criterionId: criterion.id,
        status: i < 3 ? 'met' : 'missing',
        reason: 'Criterion assessment',
        quotes: i < 3 ? [topic.examples[i]!] : [],
      })),
    },
  });

describe('standard question bank', () => {
  it('contains 24 unique topics, 72 synthetic examples and valid immutable snapshots', () => {
    expect(topics).toHaveLength(24);
    expect(new Set(topics.map((t) => t.id)).size).toBe(24);
    expect(rubricSamples).toHaveLength(72);
    for (const competency of ['vue-react', 'ai-application', 'system-design', 'project-depth'])
      expect(topics.filter((t) => t.competency === competency)).toHaveLength(6);
    for (const t of topics)
      for (const difficulty of ['l1', 'l2', 'l3'] as const)
        expect(rubricSnapshotSchema.safeParse(snapshotFor(t, difficulty)).success).toBe(true);
    expect(rubricSamples.filter((s) => s.split === 'holdout')).toHaveLength(18);
  });

  it.each(['technical', 'behavioral', 'system-design', 'screening'])(
    'preserves coverage, requested difficulty and uniqueness for %s',
    (round) => {
      for (const difficulty of ['l1', 'l2', 'l3']) {
        const questions = selectStandardQuestions({ ...input, round, difficulty }, 'session-a');
        expect(new Set(questions.map((q) => q.rubricSnapshot!.bankId)).size).toBe(8);
        expect(
          ['vue-react', 'ai-application', 'system-design', 'project-depth'].map(
            (c) => questions.filter((q) => q.competency === c).length,
          ),
        ).toEqual([1, 2, 2, 3]);
        expect(questions.filter((q) => q.isCore)).toHaveLength(4);
        expect(questions.every((q) => q.difficulty === difficulty)).toBe(true);
        expect(
          questions.every(
            (q) =>
              q.rubricSnapshot?.commonMistakes?.length === 1 &&
              q.rubricSnapshot.followUpRules?.length === 3,
          ),
        ).toBe(true);
        expect(JSON.stringify(questions)).not.toContain('sampleAnswers');
      }
    },
  );

  it('rotates recent questions while preserving coverage and can revisit an older weakness', () => {
    const initial = selectStandardQuestions(
      { ...input, profileSummary: '', jobDescription: 'React' },
      'seed',
    );
    const recentTopics = initial.map((q) => ({ id: q.id, score: 5 }));
    const next = selectStandardQuestions(
      { ...input, profileSummary: '', jobDescription: 'React', recentTopics },
      'seed',
    );
    expect(next[0]!.id).not.toBe(initial[0]!.id);
    expect(next.map((q) => q.competency)).toEqual(initial.map((q) => q.competency));
    const history = Array.from({ length: 20 }, () => ({ id: 'sys-cache', score: 5 })).concat({
      id: 'fe-race',
      score: 1,
    });
    expect(
      selectStandardQuestions({ ...input, profileSummary: '', recentTopics: history }, 'seed')[0]
        ?.id,
    ).toBe('fe-race');
  });
  it('provides separate practice and retest cases for every supported theme and language', () => {
    for (const entry of topics)
      for (const language of ['en-US', 'zh-CN', 'mixed'] as const) {
        const source = {
          ...question,
          rubricSnapshot: snapshotFor(entry, 'l2'),
          competency: entry.competency,
          prompt: entry.prompt,
        };
        const prompts = practicePrompts(source, language);
        expect(prompts[0]).toBe(source.prompt);
        expect(new Set(prompts).size).toBe(3);
      }
  });

  it('replays the same selection, localizes prompts and does not share mutable snapshots', () => {
    const questions = selectStandardQuestions(input, 'same');
    expect(selectStandardQuestions(input, 'same')).toEqual(questions);
    questions[0]!.rubricSnapshot!.criteria[0]!.description = 'tampered';
    expect(
      selectStandardQuestions(input, 'same')[0]!.rubricSnapshot!.criteria[0]!.description,
    ).not.toBe('tampered');
    expect(selectStandardQuestions({ ...input, language: 'en-US' })[0]!.prompt).toMatch(
      /^Technical discussion:/,
    );
    expect(() => selectStandardQuestions({ ...input, questionCount: 25 })).toThrow(/count/);
  });

  it('uses the bank without charging a model call and recovers checkpointed questions', async () => {
    const generateJson = vi.fn();
    const workflows = new InterviewWorkflows({ generateJson }, { checkpointer: new MemorySaver() });
    const questions = await workflows.questions(
      { ...input, targetRole: 'Frontend', stories: [], standardQuestions: true },
      { operationId: 'bank' },
    );
    expect(questions).toHaveLength(8);
    expect(
      await workflows.questions(
        { ...input, targetRole: 'Frontend', stories: [], standardQuestions: true },
        { operationId: 'bank' },
      ),
    ).toEqual(questions);
    expect(generateJson).not.toHaveBeenCalled();
  });
});

describe('rubric validation', () => {
  it('requires exact criterion coverage, answer evidence, identity and derived score', () => {
    expect(() => validateRubric(validCue(), question, answer)).not.toThrow();
    const alteredScore = validCue();
    alteredScore.score = 5;
    expect(() => validateRubric(alteredScore, question, answer)).toThrow(/score/);
    const alteredVersion = validCue();
    alteredVersion.rubricEvaluation!.questionVersion = 'other';
    expect(() => validateRubric(alteredVersion, question, answer)).toThrow(/version/);
    const inventedQuote = validCue();
    inventedQuote.rubricEvaluation!.items[0]!.quotes = ['not in this answer'];
    expect(() => validateRubric(inventedQuote, question, answer)).toThrow(/Ungrounded/);
    const unknownCriterion = validCue();
    unknownCriterion.rubricEvaluation!.items[0]!.criterionId = 'different';
    expect(() => validateRubric(unknownCriterion, question, answer)).toThrow(/criterion/);
  });

  it('requires missing items to have no quote and factual judgments to have a quote', () => {
    const missing = validCue();
    missing.rubricEvaluation!.items[3]!.quotes = ['fabricated'];
    expect(coachingCueSchema.safeParse(missing).success).toBe(false);
    const ungrounded = validCue();
    ungrounded.rubricEvaluation!.items[0]!.quotes = [];
    expect(coachingCueSchema.safeParse(ungrounded).success).toBe(false);
    const legacy = validCue();
    delete legacy.rubricEvaluation;
    expect(() =>
      validateRubric(legacy, { ...question, rubricSnapshot: null }, answer),
    ).not.toThrow();
    expect(() => validateRubric(legacy, question, answer)).toThrow(/require/);
  });

  it('enforces rubric checks through the actual CoachAgent model schema', async () => {
    const value = validCue();
    const model: AgentModelGateway = {
      async generateJson(request) {
        return {
          data: request.schema.parse(value),
          model: 'fixture',
          degraded: false,
          usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
        };
      },
    };
    const coachInput = {
      sessionId: 's',
      language: 'zh-CN',
      currentQuestion: question,
      answerText: answer,
      profileSummary: '',
      jobSummary: '',
      priorCues: [],
    };
    await expect(new CoachAgent(model).invoke(coachInput)).resolves.toMatchObject({
      data: { score: 4 },
    });
    value.score = 5;
    await expect(new CoachAgent(model).invoke(coachInput)).resolves.toMatchObject({
      data: { score: 4 },
    });
  });
});
