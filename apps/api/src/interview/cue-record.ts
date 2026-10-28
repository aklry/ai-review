import { coachingCueSchema, type CoachingCue } from '@interview-assistant/contracts';

/** Convert nullable database fields to the public optional-field contract. */
export function toCue(record: Record<string, unknown>): CoachingCue {
  const normalized = { ...record };
  if (normalized.followUpQuestion === null) delete normalized.followUpQuestion;
  return coachingCueSchema.parse(normalized);
}
