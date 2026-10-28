import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AgentUsageGateway } from './agent-usage.gateway.js';

describe('AgentUsageGateway', () => {
  it('records the actual Agent task and operation identity with provider usage', async () => {
    const result = {
      data: { summary: 'Facts' },
      model: 'fixture-flash',
      degraded: true,
      usage: { inputTokens: 10, outputTokens: 3, cachedInputTokens: 2 },
    };
    const provider = { generateJson: vi.fn(async () => result) };
    const repository = { recordUsage: vi.fn(async () => ({})) };
    const gateway = new AgentUsageGateway(provider as never, repository as never);
    await expect(
      gateway.generateJson({
        taskType: 'profile-analysis',
        schema: z.object({ summary: z.string() }),
        systemPrompt: 'Extract facts',
        userPrompt: 'Private resume',
        operationId: 'prepare:j1',
        promptVersion: 'ProfileAgent:v1',
      }),
    ).resolves.toEqual(result);
    expect(repository.recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        taskType: 'profile-analysis',
        operationId: 'prepare:j1',
        promptVersion: 'ProfileAgent:v1',
        model: 'fixture-flash',
        degraded: true,
        inputTokens: 10,
        outputTokens: 3,
        cachedInputTokens: 2,
        estimatedCostCny: expect.any(Number),
      }),
    );
    expect(JSON.stringify(repository.recordUsage.mock.calls)).not.toContain('Private resume');
  });
});
