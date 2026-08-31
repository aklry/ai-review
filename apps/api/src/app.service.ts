import { Injectable } from '@nestjs/common';
import { calculateWeightedScore } from '@interview-assistant/agent-core';

@Injectable()
export class AppService {
  getHealth() {
    return {
      service: 'interview-assistant-api',
      status: 'ok' as const,
      timestamp: new Date().toISOString(),
      scoringReady: calculateWeightedScore({
        'vue-react': 5,
        'ai-application': 5,
        'system-design': 5,
        'project-depth': 5,
      }) === 100,
    };
  }
}
