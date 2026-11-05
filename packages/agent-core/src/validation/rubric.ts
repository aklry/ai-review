import type { CoachingCue, InterviewQuestion } from '@interview-assistant/contracts';
import { validateEvidence } from './evidence.js';

export function validateRubric(
  cue: CoachingCue,
  question: InterviewQuestion,
  answer: string,
): void {
  const snapshot = question.rubricSnapshot;
  const evaluation = cue.rubricEvaluation;
  if (!snapshot) {
    if (evaluation) throw new Error('Cannot assess a rubric without a persisted question snapshot');
    return;
  }
  if (!evaluation) throw new Error('Standard questions require criterion-level rubric feedback');
  if (
    evaluation.bankId !== snapshot.bankId ||
    evaluation.questionVersion !== snapshot.questionVersion ||
    evaluation.rubricVersion !== snapshot.rubricVersion
  )
    throw new Error('Rubric identity or version changed');
  const expected = new Set(snapshot.criteria.map((criterion) => criterion.id));
  if (
    evaluation.items.length !== expected.size ||
    new Set(evaluation.items.map((item) => item.criterionId)).size !== expected.size ||
    evaluation.items.some((item) => !expected.has(item.criterionId))
  )
    throw new Error('Rubric feedback must assess each criterion exactly once');
  for (const item of evaluation.items)
    validateEvidence(
      item.quotes.map((quote) => ({ source: 'answer', quote })),
      { answer },
    );
  const score = 1 + evaluation.items.filter((item) => item.status === 'met').length;
  if (cue.score !== score)
    throw new Error(`Rubric score must be ${score}: 1 plus the number of met criteria`);
}
