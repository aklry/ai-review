import { InterviewWorkflows } from '@interview-assistant/agent-core';
import type {
  InterviewQuestion,
  InterviewSessionCreateInput,
} from '@interview-assistant/contracts';
import { describe, expect, it, vi } from 'vitest';
import { AgentUsageGateway } from '../agents/agent-usage.gateway.js';
import { normalizeException } from '../common/http/api-response.js';
import { DeepSeekProvider } from '../deepseek/deepseek.provider.js';
import { InterviewService } from './interview.service.js';

const input: InterviewSessionCreateInput = {
  profileId: 'p1',
  jobId: 'j1',
  language: 'zh-CN',
  round: 'technical',
  difficulty: 'l2',
  questionCount: 8,
};
const questions: InterviewQuestion[] = [
  'vue-react',
  'ai-application',
  'ai-application',
  'system-design',
  'system-design',
  'project-depth',
  'project-depth',
  'project-depth',
].map((competency, index) => ({
  id: `q${index}`,
  competency: competency as InterviewQuestion['competency'],
  difficulty: 'l2',
  prompt: `Describe your approach to ${competency}.`,
  isCore: true,
}));
const missingCoreQuestions = questions.map((question) => ({
  ...question,
  isCore: question.competency !== 'ai-application',
}));

function setup(outputs: InterviewQuestion[][], primary = 'primary', fallback = 'fallback') {
  const requests: Array<{ model: string; messages: Array<{ content: string }> }> = [];
  let saved: { id: string; questions: InterviewQuestion[] } | undefined;
  const provider = new DeepSeekProvider({
    apiKey: 'fixture-key',
    primaryModel: primary,
    fallbackModel: fallback,
    transport: async (_url, init) => {
      requests.push(JSON.parse(init.body));
      const generated = outputs[Math.min(requests.length - 1, outputs.length - 1)];
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: 'fixture-completion',
            object: 'chat.completion',
            created: 0,
            choices: [
              {
                index: 0,
                finish_reason: 'stop',
                message: {
                  role: 'assistant',
                  content: JSON.stringify({ questions: generated }),
                },
              },
            ],
          }),
      };
    },
  });
  const repository = {
    getProfile: async () => ({
      id: 'p1',
      resumeText: 'A frontend engineer with project delivery experience.',
      stories: [],
    }),
    getJob: async () => ({
      profileId: 'p1',
      targetRole: 'Frontend',
      company: null,
      analysisStatus: 'completed',
      analysis: {},
    }),
    createWorkflowSession: async (
      _input: InterviewSessionCreateInput,
      generated: InterviewQuestion[],
    ) => {
      saved = { id: 's1', questions: generated };
      return saved;
    },
    getSession: async () => saved,
    recordUsage: vi.fn(async () => ({})),
  };
  const workflows = new InterviewWorkflows(new AgentUsageGateway(provider, repository as never));
  const service = new InterviewService(repository as never, { workflows } as never);
  return { service, requests, repository, saved: () => saved };
}

describe('interview session question generation', () => {
  it.each([
    ['primary', 'fallback'],
    ['same-model', 'same-model'],
  ])(
    'repairs missing core coverage with %s / %s before saving a session',
    async (primary, fallback) => {
      const { service, requests, saved, repository } = setup(
        [missingCoreQuestions, questions],
        primary,
        fallback,
      );

      await expect(service.createSession(input)).resolves.toMatchObject({
        id: 's1',
        questions,
      });
      expect(requests.map((request) => request.model)).toEqual([primary, fallback]);
      expect(requests[1]?.messages.map((message) => message.content).join('\n')).toContain(
        'Missing core competency coverage: ai-application',
      );
      expect(saved()?.questions).toHaveLength(8);
      expect(repository.recordUsage).toHaveBeenCalledOnce();
    },
  );

  it.each([
    ['missing core coverage', missingCoreQuestions],
    ['incorrect question count', questions.slice(0, 7)],
    [
      'incorrect competency quotas',
      questions.map((question, index) =>
        index === 7 ? { ...question, competency: 'vue-react' as const } : question,
      ),
    ],
  ])(
    'returns a bounded 502 for repeated %s without saving an invalid session',
    async (_name, invalid) => {
      const { service, requests, saved } = setup([invalid], 'same-model', 'same-model');

      const error = await service.createSession(input).then(
        () => null,
        (reason: unknown) => reason,
      );
      const normalized = normalizeException(error, 'generation-request');
      expect(normalized.httpStatus).toBe(502);
      expect(normalized.body.message).toContain('invalid structured output');
      expect(requests).toHaveLength(2);
      expect(saved()).toBeUndefined();
    },
  );

  it('saves a valid question set without another model request', async () => {
    const { service, requests } = setup([questions]);

    await expect(service.createSession(input)).resolves.toMatchObject({ questions });
    expect(requests).toHaveLength(1);
  });
});
