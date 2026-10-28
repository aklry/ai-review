import type { ZodType } from 'zod';

export type AgentTask =
  'profile-analysis' | 'job-analysis' | 'question-generation' | 'follow-up' | 'coaching' | 'report';
export type AgentRequest<T> = {
  taskType: AgentTask;
  schema: ZodType<T>;
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens?: number;
  thinking?: 'enabled' | 'disabled';
  operationId?: string;
  sessionId?: string;
  promptVersion?: string;
};
export type AgentResult<T> = {
  data: T;
  model: string;
  degraded: boolean;
  usage: { inputTokens: number; outputTokens: number; cachedInputTokens: number };
};
export interface AgentModelGateway {
  generateJson<T>(request: AgentRequest<T>): Promise<AgentResult<T>>;
}
