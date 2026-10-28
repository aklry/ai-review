import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { CoachingCue, InterviewQuestion } from '@interview-assistant/contracts';
import { InterviewService } from './interview.service.js';
import type { InterviewSessionRecord } from './interview.repository.js';
import type { TurnCommit } from './session.repository.js';

const cue: CoachingCue = {
  competency: 'project-depth',
  score: 4,
  strengths: ['measured result'],
  gaps: ['validation'],
  nextAction: 'Explain validation.',
  evidence: [{ source: 'answer', quote: 'reduced LCP' }],
  followUpQuestion: 'How did you validate it?',
};
const question: InterviewQuestion = {
  id: 'q1',
  competency: 'project-depth',
  difficulty: 'l2',
  prompt: 'Describe a project.',
  isCore: true,
  parentQuestionId: null,
};
const second: InterviewQuestion = { ...question, id: 'q2' };
const followUp: InterviewQuestion = {
  ...question,
  id: 'followup-q1',
  parentQuestionId: 'q1',
  isCore: false,
};
const answerText = 'I reduced LCP using measured performance experiments.';
const requestHash = createHash('sha256').update(answerText).digest('hex');

function setup(overrides: Partial<InterviewSessionRecord> = {}) {
  const session: InterviewSessionRecord = {
    id: 's1',
    status: 'active',
    currentQuestionIndex: 0,
    activeQuestionId: 'q1',
    version: 0,
    plan: {
      profileId: 'p1',
      jobId: 'j1',
      language: 'zh-CN',
      profile: { resumeText: 'A frontend engineer.' },
      job: {
        targetRole: 'Engineer',
        company: null,
        description: 'Build applications.',
        analysis: {},
      },
    },
    questions: [{ ...question }, { ...second }],
    cues: [],
    report: null,
    ...overrides,
  };
  const repository = {
    getProfile: vi.fn(async () => ({
      id: 'p1',
      resumeText: 'A frontend engineer with project delivery experience.',
      stories: [],
    })),
    getJob: vi.fn(async () => ({
      id: 'j1',
      profileId: 'p1',
      targetRole: 'Frontend',
      company: null,
      description: 'Build applications.',
      analysisStatus: 'completed',
      analysis: {},
    })),
    createWorkflowSession: vi.fn(async () => ({ id: 's1' })),
    getSession: vi.fn(async () => session),
    claimSession: vi.fn(async () => true),
    renewSession: vi.fn(async () => true),
    releaseSession: vi.fn(async () => ({ count: 1 })),
    commitTurn: vi.fn(async (input: TurnCommit) => input.response),
    finishWorkflowSession: vi.fn(async (_id: string, report: unknown) => report),
    getReport: vi.fn(async () => ({ id: 'report1' })),
  };
  const workflows = {
    questions: vi.fn(async () => [question, second]),
    coach: vi.fn(async () => ({
      cue,
      followUp: null as InterviewQuestion | null,
      model: 'fixture',
      degraded: false,
    })),
    report: vi.fn(async () => ({ summary: 'Measured evidence.' })),
  };
  return {
    session,
    repository,
    workflows,
    service: new InterviewService(repository as never, { workflows } as never),
  };
}

describe('InterviewService workflow state', () => {
  it('normalizes a persisted nullable follow-up before evaluating the next answer or report', async () => {
    const storedCue = { ...cue, followUpQuestion: null };
    const { service, workflows } = setup({
      activeQuestionId: 'q2',
      version: 1,
      cues: [storedCue],
      questions: [
        { ...question, answer: { answerText, requestHash, result: {}, cue: storedCue } },
        second,
      ],
    });
    await expect(
      service.submitAnswer('s1', { questionId: 'q2', answerText }),
    ).resolves.toMatchObject({ status: 'awaiting_finish' });
    expect(workflows.coach).toHaveBeenCalledWith(
      expect.objectContaining({
        priorCues: [expect.not.objectContaining({ followUpQuestion: null })],
      }),
      expect.anything(),
    );
    await expect(service.finishSession('s1')).resolves.toMatchObject({
      summary: 'Measured evidence.',
    });
  });
  it('returns the authoritative full session context after creating its questions', async () => {
    const { service, repository, session } = setup();
    await expect(
      service.createSession({
        profileId: 'p1',
        jobId: 'j1',
        language: 'zh-CN',
        round: 'technical',
        difficulty: 'l2',
        questionCount: 2,
      }),
    ).resolves.toBe(session);
    expect(repository.createWorkflowSession).toHaveBeenCalledOnce();
    expect(repository.getSession).toHaveBeenCalledWith('s1');
  });
  it('keeps the base index while asking a follow-up, then advances to the next base', async () => {
    const { service, repository, workflows, session } = setup();
    workflows.coach.mockResolvedValueOnce({ cue, followUp, model: 'fixture', degraded: false });
    await expect(
      service.submitAnswer('s1', { questionId: 'q1', answerText }),
    ).resolves.toMatchObject({
      currentQuestionIndex: 0,
      activeQuestionId: followUp.id,
      status: 'active',
    });
    Object.assign(session, {
      version: 1,
      activeQuestionId: followUp.id,
      questions: [{ ...question }, second, followUp],
    });
    await expect(
      service.submitAnswer('s1', { questionId: followUp.id, answerText }),
    ).resolves.toMatchObject({ currentQuestionIndex: 1, activeQuestionId: 'q2', status: 'active' });
    expect(repository.commitTurn).toHaveBeenLastCalledWith(
      expect.objectContaining({
        expectedVersion: 1,
        questionId: followUp.id,
        cue: expect.not.objectContaining({ followUpQuestion: expect.anything() }),
      }),
    );
  });

  it('marks the last answer awaiting_finish with no active question', async () => {
    const { service } = setup({ questions: [question] });
    await expect(
      service.submitAnswer('s1', { questionId: 'q1', answerText }),
    ).resolves.toMatchObject({
      nextQuestion: null,
      activeQuestionId: null,
      currentQuestionIndex: 1,
      status: 'awaiting_finish',
    });
  });

  it('reuses an identical committed answer without model calls or state changes', async () => {
    const cached = {
      cue,
      nextQuestion: second,
      activeQuestionId: second.id,
      currentQuestionIndex: 1,
      status: 'active',
      model: 'fixture',
      degraded: false,
    };
    const { service, repository, workflows } = setup({
      activeQuestionId: second.id,
      questions: [
        { ...question, answer: { answerText, requestHash, result: cached, cue: null } },
        second,
      ],
    });
    await expect(service.submitAnswer('s1', { questionId: 'q1', answerText })).resolves.toEqual(
      cached,
    );
    expect(workflows.coach).not.toHaveBeenCalled();
    expect(repository.claimSession).not.toHaveBeenCalled();
    expect(repository.commitTurn).not.toHaveBeenCalled();
    await expect(
      service.submitAnswer('s1', {
        questionId: 'q1',
        answerText: 'A different answer with sufficient detail.',
      }),
    ).rejects.toThrow(/already submitted/);
  });

  it.each([{ status: 'completed' }, { status: 'awaiting_finish' }, { activeQuestionId: 'q2' }])(
    'rejects inactive submissions: %j',
    async (state) => {
      const { service, workflows } = setup(state);
      await expect(service.submitAnswer('s1', { questionId: 'q1', answerText })).rejects.toThrow(
        /active question/,
      );
      expect(workflows.coach).not.toHaveBeenCalled();
    },
  );

  it('rejects concurrent operations before calling an Agent', async () => {
    const { service, repository, workflows } = setup();
    repository.claimSession.mockResolvedValue(false);
    await expect(service.submitAnswer('s1', { questionId: 'q1', answerText })).rejects.toThrow(
      /already running/,
    );
    expect(workflows.coach).not.toHaveBeenCalled();
    expect(repository.commitTurn).not.toHaveBeenCalled();
  });

  it('releases leases after an Agent failure and allows retry', async () => {
    const { service, repository, workflows } = setup();
    workflows.coach.mockRejectedValueOnce(new Error('provider unavailable'));
    await expect(service.submitAnswer('s1', { questionId: 'q1', answerText })).rejects.toThrow(
      'provider unavailable',
    );
    expect(repository.releaseSession).toHaveBeenCalledWith('s1', expect.any(String));
    expect(repository.commitTurn).not.toHaveBeenCalled();
    await expect(
      service.submitAnswer('s1', { questionId: 'q1', answerText }),
    ).resolves.toMatchObject({ activeQuestionId: 'q2' });
  });

  it('does not mask a committed response when lease cleanup fails', async () => {
    const { service, repository } = setup();
    repository.releaseSession.mockRejectedValueOnce(new Error('temporary database disconnect'));
    await expect(
      service.submitAnswer('s1', { questionId: 'q1', answerText }),
    ).resolves.toMatchObject({ activeQuestionId: 'q2' });
  });

  it('scores only answered base questions when producing a report', async () => {
    const baseCue = { ...cue };
    delete baseCue.followUpQuestion;
    const { service, workflows, repository } = setup({
      status: 'awaiting_finish',
      activeQuestionId: null,
      questions: [
        { ...question, answer: { answerText, requestHash, result: {}, cue: baseCue } },
        { ...followUp, answer: { answerText, requestHash, result: {}, cue } },
      ],
    });
    await service.finishSession('s1');
    expect(workflows.report).toHaveBeenCalledWith(
      expect.objectContaining({ cues: [baseCue], supplementalCues: [cue] }),
      expect.objectContaining({ sessionId: 's1' }),
    );
    expect(repository.finishWorkflowSession).toHaveBeenCalledOnce();
  });

  it('reuses a completed report without regenerating it', async () => {
    const { service, workflows, repository } = setup({
      status: 'completed',
      report: { id: 'report1' },
    });
    await expect(service.finishSession('s1')).resolves.toEqual({ id: 'report1' });
    expect(repository.getReport).toHaveBeenCalledWith('s1');
    expect(workflows.report).not.toHaveBeenCalled();
  });

  it('refuses to manufacture a report before any base question was assessed', async () => {
    const { service, workflows } = setup();
    await expect(service.finishSession('s1')).rejects.toThrow(/at least one/);
    expect(workflows.report).not.toHaveBeenCalled();
  });

  it('recovers persisted processing jobs at startup and drains them before shutdown', async () => {
    const profile = {
      id: 'p1',
      resumeText: 'A frontend engineer with project delivery experience.',
      stories: [],
      structuredResume: null,
      structuredResumeHash: null,
    };
    const repository = {
      recoverableJobs: vi.fn(async () => [{ id: 'persisted-job' }]),
      claimJob: vi.fn(async () => true),
      renewJob: vi.fn(async () => ({})),
      getJob: vi.fn(async () => ({
        id: 'persisted-job',
        profileId: 'p1',
        targetRole: 'Frontend',
        company: null,
        description: 'Build applications.',
        inputHash: null,
      })),
      getProfile: vi.fn(async () => profile),
      saveStructuredProfile: vi.fn(async () => ({})),
      completeJob: vi.fn(async () => undefined),
      failJob: vi.fn(async () => undefined),
    };
    let finish: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const prepare = vi.fn(async () => {
      await gate;
      return { profile: { summary: 'Engineer' }, analysis: { summary: 'Applications' } };
    });
    const service = new InterviewService(repository as never, { workflows: { prepare } } as never);
    service.onApplicationBootstrap();
    await vi.waitFor(() => expect(prepare).toHaveBeenCalledOnce());
    let closed = false;
    const closing = service.onModuleDestroy().then(() => {
      closed = true;
    });
    await Promise.resolve();
    expect(closed).toBe(false);
    finish!();
    await closing;
    expect(repository.saveStructuredProfile).toHaveBeenCalledOnce();
    expect(repository.completeJob).toHaveBeenCalledWith('persisted-job', expect.any(String), {
      summary: 'Applications',
    });
    expect(repository.failJob).not.toHaveBeenCalled();
  });
});
