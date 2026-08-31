import {
  competencyScoresSchema,
  scoreWeights,
  type Competency,
  type CompetencyScores,
} from '@interview-assistant/contracts';

const competencies: Competency[] = ['vue-react', 'ai-application', 'system-design', 'project-depth'];

export function calculateWeightedScore(scores: CompetencyScores): number {
  const validScores = competencyScoresSchema.parse(scores);
  const weightedScore = competencies.reduce((total, competency) => {
    const score = validScores[competency];
    return total + (score / 5) * scoreWeights[competency];
  }, 0);

  return Math.round(weightedScore * 100) / 100;
}

export { questionInventory, scoreWeights } from '@interview-assistant/contracts';
