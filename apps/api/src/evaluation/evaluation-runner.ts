import type {
  AgentModelGateway,
  AgentRequest,
  AgentResult,
  AgentTask,
} from '@interview-assistant/agent-core';

export type EvaluationCheck = { name: string; passed: boolean; detail?: string };
export type EvaluationProbe = {
  id: string;
  title: string;
  skip?: () => string | undefined;
  run(): Promise<{ output: unknown; checks: EvaluationCheck[] }>;
};
export type EvaluationResult = {
  id: string;
  title: string;
  status: 'passed' | 'failed' | 'skipped';
  elapsedMs: number;
  checks: EvaluationCheck[];
  output?: unknown;
  error?: string;
};
export type EvaluationCall = {
  taskType: AgentTask;
  elapsedMs: number;
  success: boolean;
  model: string | null;
  usage: AgentResult<unknown>['usage'] | null;
  degraded: boolean | null;
  error?: string;
};

function message(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 800) : 'Unknown evaluation error';
}

export async function runEvaluation(
  probes: EvaluationProbe[],
  options: { now?: () => number; onResult?: (result: EvaluationResult) => void } = {},
) {
  const now = options.now ?? Date.now;
  const results: EvaluationResult[] = [];
  for (const probe of probes) {
    const reason = probe.skip?.();
    let result: EvaluationResult;
    if (reason) {
      result = {
        id: probe.id,
        title: probe.title,
        status: 'skipped',
        elapsedMs: 0,
        checks: [],
        error: reason,
      };
    } else {
      const start = now();
      try {
        const { output, checks } = await probe.run();
        result = {
          id: probe.id,
          title: probe.title,
          status: checks.every((c) => c.passed) ? 'passed' : 'failed',
          elapsedMs: now() - start,
          checks,
          output,
        };
      } catch (error) {
        result = {
          id: probe.id,
          title: probe.title,
          status: 'failed',
          elapsedMs: now() - start,
          checks: [],
          error: message(error),
        };
      }
    }
    results.push(result);
    options.onResult?.(result);
  }
  return results;
}

/** Records metadata, never prompts. Usage is the provider's returned usage, not a billing audit. */
export class EvaluationGateway implements AgentModelGateway {
  readonly calls: EvaluationCall[] = [];
  constructor(private readonly model: AgentModelGateway) {}
  async generateJson<T>(request: AgentRequest<T>): Promise<AgentResult<T>> {
    const start = Date.now();
    try {
      const result = await this.model.generateJson(request);
      this.calls.push({
        taskType: request.taskType,
        elapsedMs: Date.now() - start,
        success: true,
        model: result.model,
        usage: result.usage,
        degraded: result.degraded,
      });
      return result;
    } catch (error) {
      this.calls.push({
        taskType: request.taskType,
        elapsedMs: Date.now() - start,
        success: false,
        model: null,
        usage: null,
        degraded: null,
        error: message(error),
      });
      throw error;
    }
  }
}

export function evaluateScorePair(
  language: string,
  strong?: number,
  weak?: number,
): EvaluationCheck {
  return {
    name: `${language}:strong-outscores-weak`,
    passed: strong !== undefined && weak !== undefined && strong > weak,
    detail: `strong=${strong ?? 'missing'}, weak=${weak ?? 'missing'}`,
  };
}
