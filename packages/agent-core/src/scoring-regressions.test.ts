import { describe, expect, it } from 'vitest';
import { coachingCueSchema, evaluationReportSchema } from '@interview-assistant/contracts';
import { calculateWeightedScore, normalizeCompetencyScores, parseModelJson } from './index.js';

describe('evidence-based scoring regressions', () => {
  it('does not assign scores or a passing total to an unanswered interview', () => {
    const scores = normalizeCompetencyScores([]);
    expect(scores).toEqual({
      'vue-react': null,
      'ai-application': null,
      'system-design': null,
      'project-depth': null,
    });
    expect(calculateWeightedScore(scores)).toBeNull();
  });

  it('leaves unassessed competencies empty instead of inventing average scores', () => {
    const scores = normalizeCompetencyScores([
      {
        competency: 'project-depth',
        score: 4,
        strengths: [],
        gaps: [],
        nextAction: 'Practice',
        evidence: [{ source: 'answer', quote: 'I owned the rollout.' }],
      },
    ]);
    expect(scores['project-depth']).toBe(4);
    expect(scores['system-design']).toBeNull();
    expect(calculateWeightedScore(scores)).toBeNull();
  });

  it('rejects feedback without an actual score or evidence', () => {
    expect(() => parseModelJson(coachingCueSchema, '{"feedback":{}}')).toThrow(/model output/i);
  });

  it('does not fabricate a complete report from a summary-only response', () => {
    expect(() => parseModelJson(evaluationReportSchema, '{"summary":"Incomplete"}')).toThrow(
      /model output/i,
    );
  });

  it('rejects a seven-day plan containing the same day seven times', () => {
    expect(
      evaluationReportSchema.safeParse({
        summary: 'A report',
        overallScore: 80,
        competencyScores: {
          'vue-react': 4,
          'ai-application': 4,
          'system-design': 4,
          'project-depth': 4,
        },
        cues: [],
        strengths: [],
        gaps: [],
        nextPlan: Array.from({ length: 7 }, () => ({
          day: 1,
          focus: 'project-depth',
          task: 'Practice',
          reason: 'Evidence',
        })),
      }).success,
    ).toBe(false);
  });
});
