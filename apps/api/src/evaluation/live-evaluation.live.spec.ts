import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { DeepSeekProvider } from '../deepseek/deepseek.provider.js';
import { EvaluationGateway, runEvaluation } from './evaluation-runner.js';
import { createSyntheticEvaluation } from './synthetic-evaluation.js';

it.skipIf(process.env.RUN_LIVE_AGENT_EVAL !== '1')(
  'evaluates real models using synthetic data only',
  async () => {
    if (!process.env.DEEPSEEK_API_KEY?.trim())
      throw new Error('DEEPSEEK_API_KEY is required for live evaluation');
    const start = Date.now();
    const gateway = new EvaluationGateway(new DeepSeekProvider());
    const suite = createSyntheticEvaluation(gateway, `eval-${randomUUID()}`);
    const cases = await runEvaluation(suite.probes, {
      onResult: (r) => console.info(`[live-eval] ${r.id}: ${r.status} (${r.elapsedMs}ms)`),
    });
    const qualityChecks = suite.qualityChecks();
    const directory = resolve('../../.cache/evals');
    await mkdir(directory, { recursive: true });
    const outputPath = resolve(directory, `${new Date().toISOString().replaceAll(':', '-')}.json`);
    const report = {
      createdAt: new Date().toISOString(),
      dataset: 'synthetic-interview-v1',
      elapsedMs: Date.now() - start,
      passed: cases.every((c) => c.status === 'passed') && qualityChecks.every((c) => c.passed),
      manualReviewRequired: true,
      notes: [
        'Synthetic data only; no business database writes.',
        'Automatic checks validate structure, evidence and coarse score ordering; human review is still required.',
        'Usage is what the provider returned; failed/repair attempts may incur additional usage. This is not a billing audit.',
      ],
      cases,
      qualityChecks,
      calls: gateway.calls,
      returnedUsage: gateway.calls.reduce(
        (sum, call) => ({
          inputTokens: sum.inputTokens + (call.usage?.inputTokens ?? 0),
          outputTokens: sum.outputTokens + (call.usage?.outputTokens ?? 0),
          cachedInputTokens: sum.cachedInputTokens + (call.usage?.cachedInputTokens ?? 0),
        }),
        { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
      ),
    };
    await writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');
    console.info(`[live-eval] Results: ${outputPath}`);
    for (const check of qualityChecks)
      console.info(
        `[live-eval] ${check.name}: ${check.passed ? 'passed' : 'failed'} (${check.detail})`,
      );
    expect(report.passed, `See ${outputPath} for failed probes or quality checks`).toBe(true);
  },
  1_200_000,
);
