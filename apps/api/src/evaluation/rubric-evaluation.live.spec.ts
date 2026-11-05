import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { DeepSeekProvider, isProviderAccountError } from '../deepseek/deepseek.provider.js';
import { EvaluationGateway, runEvaluation } from './evaluation-runner.js';
import { createRubricEvaluation } from './rubric-evaluation.js';

it.skipIf(process.env.RUN_LIVE_RUBRIC_EVAL !== '1')(
  'evaluates versioned rubric quality and repeatability with synthetic answers',
  async () => {
    if (!process.env.DEEPSEEK_API_KEY?.trim()) throw new Error('DEEPSEEK_API_KEY is required');
    const scope =
      process.env.RUBRIC_EVAL_SCOPE === 'full'
        ? 'full'
        : process.env.RUBRIC_EVAL_SCOPE === 'edges'
          ? 'edges'
          : 'smoke';
    const gateway = new EvaluationGateway(new DeepSeekProvider());
    const suite = createRubricEvaluation(gateway, scope);
    const startedAt = Date.now();
    const cases = await runEvaluation(suite.probes, {
      stopOnError: (error) =>
        isProviderAccountError(error)
          ? `Stopped after provider account error ${error.providerStatus}; remaining probes were not requested.`
          : undefined,
      onResult: (result) =>
        console.info(`[rubric-eval] ${result.id}: ${result.status} (${result.elapsedMs}ms)`),
    });
    const quality = suite.summarize();
    const report = {
      createdAt: new Date().toISOString(),
      dataset: 'synthetic-rubric-v1',
      rubricVersion: 'rubric-v3',
      scope,
      elapsedMs: Date.now() - startedAt,
      humanLabelsVerified: false,
      manualReviewRequired: true,
      passed: cases.every((item) => item.status === 'passed') && quality.passed,
      cases,
      quality,
      calls: gateway.calls,
    };
    const directory = resolve('../../.cache/evals');
    await mkdir(directory, { recursive: true });
    const path = resolve(directory, `rubric-${new Date().toISOString().replaceAll(':', '-')}.json`);
    await writeFile(path, JSON.stringify(report, null, 2), 'utf8');
    console.info(`[rubric-eval] Results: ${path}`);
    expect(report.passed, `Inspect ${path}; synthetic labels still require human review`).toBe(
      true,
    );
  },
  3_600_000,
);
