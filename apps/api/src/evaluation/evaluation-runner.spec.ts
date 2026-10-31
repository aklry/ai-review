import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { EvaluationGateway, evaluateScorePair, runEvaluation } from './evaluation-runner.js';

describe('model evaluation runner', () => {
  it('keeps failures and skipped dependencies while continuing independent probes', async () => {
    let tick = 0;
    const results = await runEvaluation(
      [
        {
          id: 'failed',
          title: 'Failure',
          run: async () => {
            throw new Error('model unavailable');
          },
        },
        {
          id: 'dependent',
          title: 'Dependent',
          skip: () => 'missing preparation',
          run: async () => {
            throw new Error('must not run');
          },
        },
        {
          id: 'valid',
          title: 'Valid',
          run: async () => ({
            output: { score: 4 },
            checks: [{ name: 'validated', passed: true }],
          }),
        },
        {
          id: 'invalid',
          title: 'Invalid',
          run: async () => ({ output: {}, checks: [{ name: 'quality', passed: false }] }),
        },
      ],
      { now: () => tick++ },
    );
    expect(results.map((r) => r.status)).toEqual(['failed', 'skipped', 'passed', 'failed']);
    expect(results[0]).toMatchObject({ error: 'model unavailable', elapsedMs: 1 });
    expect(results[1]).toMatchObject({ error: 'missing preparation', elapsedMs: 0 });
    expect(results[2]?.output).toEqual({ score: 4 });
  });

  it('records returned usage and failures without retaining prompts or credentials', async () => {
    const gateway = new EvaluationGateway({
      generateJson: async () => ({
        data: { score: 4 },
        model: 'fixture',
        degraded: false,
        usage: { inputTokens: 20, outputTokens: 5, cachedInputTokens: 2 },
      }),
    } as never);
    await gateway.generateJson({
      taskType: 'coaching',
      schema: z.object({ score: z.number() }),
      systemPrompt: 'PRIVATE SYSTEM',
      userPrompt: 'PRIVATE ANSWER',
    });
    expect(gateway.calls[0]).toMatchObject({
      taskType: 'coaching',
      success: true,
      model: 'fixture',
      usage: { inputTokens: 20 },
    });
    expect(JSON.stringify(gateway.calls)).not.toContain('PRIVATE');
    const failed = new EvaluationGateway({
      generateJson: async () => {
        throw new Error('unavailable');
      },
    });
    await expect(
      failed.generateJson({
        taskType: 'report',
        schema: z.object({}),
        systemPrompt: '',
        userPrompt: '',
      }),
    ).rejects.toThrow('unavailable');
    expect(failed.calls[0]).toMatchObject({ success: false, usage: null, error: 'unavailable' });
  });

  it('requires strong answers to outscore weak answers and reports missing scores honestly', () => {
    expect(evaluateScorePair('zh-CN', 4, 1).passed).toBe(true);
    expect(evaluateScorePair('zh-CN', 3, 3).passed).toBe(false);
    expect(evaluateScorePair('en-US', undefined, 1).passed).toBe(false);
  });
});
