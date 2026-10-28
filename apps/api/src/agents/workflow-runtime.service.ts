import { Injectable, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { InterviewWorkflows } from '@interview-assistant/agent-core';
import { DeepSeekProvider } from '../deepseek/deepseek.provider.js';
import { InterviewRepository } from '../interview/interview.repository.js';
import { AgentUsageGateway } from './agent-usage.gateway.js';

@Injectable()
export class WorkflowRuntime implements OnModuleInit, OnApplicationShutdown {
  private graphs: InterviewWorkflows | undefined;
  private saver: PostgresSaver | undefined;
  constructor(
    private readonly provider: DeepSeekProvider,
    private readonly repository: InterviewRepository,
  ) {}
  get workflows(): InterviewWorkflows {
    if (!this.graphs) throw new Error('Agent workflow runtime is not initialized');
    return this.graphs;
  }
  async onModuleInit() {
    this.saver = PostgresSaver.fromConnString(
      process.env.DATABASE_URL ??
        'postgresql://interview:interview_dev_only@localhost:5432/interview_assistant',
      { schema: process.env.AGENT_CHECKPOINT_SCHEMA ?? 'public' },
    );
    await this.saver.setup();
    this.graphs = new InterviewWorkflows(new AgentUsageGateway(this.provider, this.repository), {
      checkpointer: this.saver,
    });
  }
  async onApplicationShutdown() {
    await this.saver?.end();
  }
}
