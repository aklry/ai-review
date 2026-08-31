import { describe, expect, it } from 'vitest';
import { calculateWeightedScore } from './index.js';

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
