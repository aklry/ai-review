import type { CoachingCue } from '@interview-assistant/contracts';

/** Teaching material is never evidence of the candidate's own performance. */
export function feedbackForAssessment(cue: CoachingCue): CoachingCue {
  const feedback = { ...cue };
  delete feedback.referenceAnswer;
  return feedback;
}
