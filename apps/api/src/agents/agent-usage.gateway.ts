import type { AgentModelGateway, AgentRequest } from '@interview-assistant/agent-core';
import type { DeepSeekProvider } from '../deepseek/deepseek.provider.js';
import type { InterviewRepository } from '../interview/interview.repository.js';

export class AgentUsageGateway implements AgentModelGateway {
  constructor(
    private readonly provider: DeepSeekProvider,
    private readonly repository: InterviewRepository,
  ) {}
  async generateJson<T>(request: AgentRequest<T>) {
    const result = await this.provider.generateJson(request);
    const price = result.model.includes('flash')
      ? { input: 0.44, cached: 0.014, output: 1.32 }
      : { input: 1.32, cached: 0.044, output: 3.96 };
    await this.repository.recordUsage({
      userKey: 'local-user',
      taskType: request.taskType,
      model: result.model,
      degraded: result.degraded,
      ...result.usage,
      estimatedCostCny:
        ((result.usage.inputTokens - result.usage.cachedInputTokens) * price.input +
          result.usage.cachedInputTokens * price.cached +
          result.usage.outputTokens * price.output) /
        1_000_000,
      ...(request.sessionId ? { sessionId: request.sessionId } : {}),
      ...(request.operationId ? { operationId: request.operationId } : {}),
      ...(request.promptVersion ? { promptVersion: request.promptVersion } : {}),
    });
    return result;
  }
}
