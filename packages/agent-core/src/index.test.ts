import {
  coachingCueSchema,
  jobAnalysisSchema,
  questionSetSchema,
} from '@interview-assistant/contracts';
import { describe, expect, it } from 'vitest';
import {
  buildAnalysisPrompt,
  buildCoachingPrompt,
  calculateWeightedScore,
  normalizeCompetencyScores,
  parseModelJson,
} from './index.js';

describe('calculateWeightedScore', () => {
  it('returns 100 when every competency is scored at five', () => {
    expect(
      calculateWeightedScore({
        'vue-react': 5,
        'ai-application': 5,
        'system-design': 5,
        'project-depth': 5,
      }),
    ).toBe(100);
  });

  it('applies the confirmed 10/20/30/40 competency weights', () => {
    expect(
      calculateWeightedScore({
        'vue-react': 1,
        'ai-application': 2,
        'system-design': 3,
        'project-depth': 4,
      }),
    ).toBe(60);
  });
});

describe('normalizeCompetencyScores', () => {
  it('normalizes average cue scores per competency before weighted aggregation', () => {
    const scores = normalizeCompetencyScores([
      {
        competency: 'project-depth',
        score: 5,
        strengths: [],
        gaps: [],
        nextAction: 'keep',
        evidence: [{ source: 'answer', quote: 'owned rollout' }],
      },
      {
        competency: 'project-depth',
        score: 3,
        strengths: [],
        gaps: [],
        nextAction: 'add metrics',
        evidence: [{ source: 'answer', quote: 'no metrics' }],
      },
      {
        competency: 'system-design',
        score: 4,
        strengths: [],
        gaps: [],
        nextAction: 'cover failures',
        evidence: [{ source: 'job_description', quote: 'scalable platform' }],
      },
    ]);

    expect(scores).toEqual({
      'vue-react': 3,
      'ai-application': 3,
      'system-design': 4,
      'project-depth': 4,
    });
    expect(calculateWeightedScore(scores)).toBe(74);
  });
});

describe('parseModelJson', () => {
  it('parses valid model JSON and rejects schema drift', () => {
    const parsed = parseModelJson(
      coachingCueSchema,
      JSON.stringify({
        competency: 'ai-application',
        score: 4,
        strengths: ['明确提到评估集'],
        gaps: ['补充成本监控'],
        nextAction: '用一次线上回归评测说明取舍',
        evidence: [{ source: 'answer', quote: '我们有离线评估集' }],
      }),
    );

    expect(parsed.score).toBe(4);
    expect(() => parseModelJson(coachingCueSchema, '{"score": 9}')).toThrow(/model output/i);
  });

  it('accepts JSON surrounded by provider commentary', () => {
    expect(
      parseModelJson(
        coachingCueSchema,
        'Here is the JSON:\n{"competency":"ai-application","score":4,"strengths":["evidence"],"gaps":["cost"],"nextAction":"add monitoring","evidence":[{"source":"answer","quote":"eval"}]}',
      ),
    ).toMatchObject({ score: 4 });
  });

  it('repairs common question field names and difficulty aliases', () => {
    const parsed = parseModelJson(
      questionSetSchema,
      JSON.stringify({
        questions: [{ question: '介绍一个项目', competency: 'frontend', difficulty: 'medium' }],
      }),
    );
    expect(parsed.questions[0]).toMatchObject({
      prompt: '介绍一个项目',
      competency: 'vue-react',
      difficulty: 'l2',
      isCore: false,
    });
  });

  it('defaults omitted question difficulty to l2', () => {
    const parsed = parseModelJson(
      questionSetSchema,
      JSON.stringify({ questions: [{ prompt: '介绍一个项目', competency: 'frontend' }] }),
    );
    expect(parsed.questions[0]?.difficulty).toBe('l2');
  });

  it('repairs an incomplete coaching response', () => {
    const parsed = parseModelJson(coachingCueSchema, JSON.stringify({ feedback: {} }));
    expect(parsed).toMatchObject({ competency: 'project-depth', score: 3, gaps: [] });
    expect(parsed.evidence).toHaveLength(1);
  });
});

describe('prompt builders', () => {
  it('builds analysis prompts with compliance and evidence requirements', () => {
    const prompt = buildAnalysisPrompt({
      profileId: 'profile_1',
      resumeText: '负责 Vue 组件库和 RAG 项目落地',
      jobDescription: '需要 React、RAG、系统设计和跨团队协作经验',
      targetRole: 'AI Frontend Engineer',
      company: 'Example AI',
      stories: [],
    });

    expect(prompt).toContain('AI Frontend Engineer');
    expect(prompt).toContain('必须引用');
    expect(prompt).toContain('不得编造');
  });

  it('builds coaching prompts for the current question and answer', () => {
    const prompt = buildCoachingPrompt({
      sessionId: 'session_1',
      language: 'zh-CN',
      currentQuestion: {
        id: 'question_1',
        competency: 'project-depth',
        difficulty: 'l2',
        prompt: '讲一个你主导性能优化的项目。',
        isCore: true,
      },
      answerText: '我负责首屏性能优化，LCP 从 4.8s 降到 2.1s。',
      profileSummary: '前端工程师，负责性能优化。',
      jobSummary: '需要性能优化和系统设计经验。',
      priorCues: [],
    });

    expect(prompt).toContain('LCP 从 4.8s 降到 2.1s');
    expect(prompt).toContain('CoachingCue');
    expect(prompt).toContain('JSON');
  });

  it('includes a complete analysis JSON example that the consumer schema accepts', () => {
    const prompt = buildAnalysisPrompt({
      profileId: 'profile_1',
      targetRole: 'Frontend Engineer',
      resumeText: 'Built Vue and React dashboards.',
      jobDescription: 'Build accessible frontend applications and AI features.',
      stories: [],
    });
    const example = prompt.split('\n').find((line) => line.startsWith('{'));

    expect(example).toBeDefined();
    const parsed = jobAnalysisSchema.parse(JSON.parse(example!));
    expect(parsed.competencies[0]?.evidence[0]).toMatchObject({ source: 'job_description' });
    for (const competency of ['vue-react', 'ai-application', 'system-design', 'project-depth']) {
      expect(prompt).toContain(competency);
    }
  });
});
