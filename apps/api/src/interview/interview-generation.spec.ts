import { InterviewWorkflows } from '@interview-assistant/agent-core';
import type {
  InterviewQuestion,
  InterviewSessionCreateInput,
} from '@interview-assistant/contracts';
import { describe, expect, it, vi } from 'vitest';
import { InterviewService } from './interview.service.js';

const input: InterviewSessionCreateInput = {
  profileId: 'p1',
  jobId: 'j1',
  language: 'zh-CN',
  round: 'technical',
  difficulty: 'l2',
  questionCount: 8,
};
function setup(profileId = 'p1') {
  let saved: { id: string; questions: InterviewQuestion[] } | undefined;
  const generateJson = vi.fn();
  const repository = {
    getProfile: async () => ({
      id: 'p1',
      resumeText: 'React engineer building RAG tools.',
      stories: [],
    }),
    getJob: async () => ({
      profileId,
      targetRole: 'Frontend',
      company: null,
      analysisStatus: 'completed',
      analysis: {},
    }),
    createWorkflowSession: vi.fn(
      async (_input: InterviewSessionCreateInput, questions: InterviewQuestion[]) => {
        saved = { id: 's1', questions };
        return saved;
      },
    ),
    getSession: async () => saved,
  };
  const workflows = new InterviewWorkflows({ generateJson });
  return {
    service: new InterviewService(repository as never, { workflows } as never),
    repository,
    generateJson,
  };
}

describe('standard interview session preparation', () => {
  it('persists unique versioned questions with fixed coverage without a model call', async () => {
    const { service, generateJson, repository } = setup();
    const session = await service.createSession(input);
    expect(session.questions).toHaveLength(8);
    expect(new Set(session.questions.map((q) => q.rubricSnapshot!.bankId)).size).toBe(8);
    expect(
      ['vue-react', 'ai-application', 'system-design', 'project-depth'].map(
        (c) => session.questions.filter((q) => q.competency === c).length,
      ),
    ).toEqual([1, 2, 2, 3]);
    expect(session.questions.every((q) => q.rubricSnapshot?.rubricVersion === 'rubric-v3')).toBe(
      true,
    );
    expect(repository.createWorkflowSession).toHaveBeenCalledOnce();
    expect(generateJson).not.toHaveBeenCalled();
  });

  it.each(['l1', 'l2', 'l3'] as const)(
    'preserves requested %s difficulty and English language',
    async (difficulty) => {
      const { service } = setup();
      const session = await service.createSession({ ...input, difficulty, language: 'en-US' });
      expect(
        session.questions.every(
          (q) => q.difficulty === difficulty && q.prompt.startsWith('Technical discussion:'),
        ),
      ).toBe(true);
    },
  );

  it('does not create a session for a job belonging to another profile', async () => {
    const { service, repository } = setup('other');
    await expect(service.createSession(input)).rejects.toThrow(/belong/);
    expect(repository.createWorkflowSession).not.toHaveBeenCalled();
  });
});
