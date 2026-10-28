import { describe, expect, it } from 'vitest';
import { MemorySaver } from '@langchain/langgraph';
import { InterviewWorkflows } from './interview-workflows.js';
import { ProfileAgent } from '../agents/profile-agent.js';
import { JobAgent } from '../agents/job-agent.js';
import { CoachAgent } from '../agents/coach-agent.js';
import type { AgentModelGateway, AgentRequest } from '../agents/model-gateway.js';

const resumeText = 'I owned a Vue project and reduced LCP from 4.8s to 2.1s.';
const jobDescription = 'Build frontend and AI systems.';
const profile = {
  summary: 'Vue project owner',
  skills: ['Vue'],
  projects: [],
  evidence: [{ source: 'resume', quote: 'I owned a Vue project' }],
  missingEvidence: [],
};
const competencies = ['vue-react', 'ai-application', 'system-design', 'project-depth'];
const analysis = {
  summary: 'Build reliable products',
  competencies: competencies.map((competency) => ({
    competency,
    priority: 'high',
    summary: 'Practice',
    focusAreas: ['delivery'],
    evidence: [{ source: 'job_description', quote: jobDescription }],
  })),
  likelyQuestions: ['Describe a project'],
  missingEvidence: [],
};
const question = {
  id: 'q1',
  competency: 'project-depth' as const,
  difficulty: 'l2' as const,
  prompt: 'Describe your contribution',
  isCore: true,
};
const cue = {
  competency: 'project-depth',
  score: 4,
  strengths: ['Ownership'],
  gaps: [],
  nextAction: 'Add validation',
  evidence: [{ source: 'answer', quote: 'LCP from 4.8s to 2.1s' }],
  followUpQuestion: 'How did you validate it?',
};

function fakeModel(outputs: Record<string, unknown>) {
  const calls: string[] = [];
  const prompts: string[] = [];
  const model: AgentModelGateway = {
    async generateJson<T>(request: AgentRequest<T>) {
      calls.push(request.taskType);
      prompts.push(request.userPrompt);
      const value = outputs[request.taskType];
      if (value instanceof Error) throw value;
      return {
        data: request.schema.parse(value),
        model: 'fake-model',
        degraded: false,
        usage: { inputTokens: 1, outputTokens: 1, cachedInputTokens: 0 },
      };
    },
  };
  return { model, calls, prompts };
}

describe('agent workflows', () => {
  it('derives report scores in code and retains null for unassessed dimensions', async () => {
    const { model, calls, prompts } = fakeModel({
      report: {
        summary: 'Partial assessment.',
        strengths: ['Ownership'],
        gaps: ['Validation'],
        overallScore: 100,
        competencyScores: {
          'vue-react': 5,
          'ai-application': 5,
          'system-design': 5,
          'project-depth': 5,
        },
        nextPlan: Array.from({ length: 7 }, (_, index) => ({
          day: index + 1,
          focus: 'project-depth',
          task: 'Practice validation.',
          reason: 'Support the result.',
        })),
      },
    });
    const workflow = new InterviewWorkflows(model);
    const result = await workflow.report(
      {
        sessionId: 's1',
        language: 'zh-CN',
        profileSummary: resumeText,
        jobSummary: jobDescription,
        supplementalCues: [
          {
            ...cue,
            score: 5,
            competency: 'project-depth',
            evidence: [{ source: 'answer', quote: 'Measured using field data' }],
          },
        ],
        cues: [
          {
            ...cue,
            competency: 'project-depth',
            evidence: [{ source: 'answer', quote: 'LCP from 4.8s to 2.1s' }],
          },
        ],
      },
      { operationId: 'report-1' },
    );
    expect(calls).toEqual(['report']);
    expect(result.overallScore).toBeNull();
    expect(result.competencyScores).toEqual({
      'vue-react': null,
      'ai-application': null,
      'system-design': null,
      'project-depth': 4,
    });
    expect(result.assessmentStatus).toBe('partial');
    expect(result.scoringVersion).toBe('evidence-v2');
    expect(result.supplementalCues?.[0]?.score).toBe(5);
    expect(prompts[0]).toContain('Measured using field data');
  });

  it('reuses completed checkpoints and rejects reuse with different facts', async () => {
    const { model, calls } = fakeModel({ 'profile-analysis': profile, 'job-analysis': analysis });
    const workflow = new InterviewWorkflows(model, { checkpointer: new MemorySaver() });
    const input = {
      profileId: 'p1',
      resumeText,
      stories: [],
      targetRole: 'Frontend',
      jobDescription,
    };
    await workflow.prepare(input, { operationId: 'same-operation' });
    await workflow.prepare(input, { operationId: 'same-operation' });
    expect(calls).toEqual(['profile-analysis', 'job-analysis']);
    await expect(
      workflow.prepare(
        { ...input, resumeText: resumeText + ' New facts.' },
        { operationId: 'same-operation' },
      ),
    ).rejects.toThrow(/different input/);
  });
  it('runs profile then job analysis and resumes a failed job node without regenerating the profile', async () => {
    const outputs: Record<string, unknown> = {
      'profile-analysis': profile,
      'job-analysis': new Error('temporary model failure'),
    };
    const { model, calls } = fakeModel(outputs);
    const workflow = new InterviewWorkflows(model, { checkpointer: new MemorySaver() });
    const input = {
      profileId: 'p1',
      resumeText,
      stories: [],
      targetRole: 'Frontend',
      jobDescription,
    };
    await expect(workflow.prepare(input, { operationId: 'job-1' })).rejects.toThrow(
      'temporary model failure',
    );
    outputs['job-analysis'] = analysis;
    const result = await workflow.prepare(input, { operationId: 'job-1' });
    expect(calls).toEqual(['profile-analysis', 'job-analysis', 'job-analysis']);
    expect(result.profile.summary).toBe('Vue project owner');
    expect(result.analysis.competencies).toHaveLength(4);
  });

  it('rejects invented resume quotations even when their JSON shape is valid', async () => {
    const { model } = fakeModel({
      'profile-analysis': {
        ...profile,
        evidence: [{ source: 'resume', quote: 'Invented experience' }],
      },
    });
    await expect(new ProfileAgent(model).invoke({ resumeText, stories: [] })).rejects.toThrow(
      /evidence|quote/i,
    );
  });

  it.each(['profile', 'job', 'coach'] as const)(
    'accepts decoded history quotations with quotes, newlines and backslashes in the %s agent',
    async (kind) => {
      const quote = 'Shipped "Beta" in C:\\build\\release\nReduced latency 30%';
      const story = {
        title: 'Release',
        project: 'Frontend',
        situation: 'Slow application',
        task: 'Improve latency',
        action: 'Optimize rendering',
        result: quote,
        metrics: [],
      };
      const historyEvidence = [{ source: 'history', quote }];
      const { model } = fakeModel({
        'profile-analysis': { ...profile, evidence: historyEvidence },
        'job-analysis': {
          ...analysis,
          competencies: analysis.competencies.map((item) => ({
            ...item,
            evidence: historyEvidence,
          })),
        },
        coaching: { ...cue, evidence: historyEvidence },
      });
      const request =
        kind === 'profile'
          ? new ProfileAgent(model).invoke({ resumeText, stories: [story] })
          : kind === 'job'
            ? new JobAgent(model).invoke({
                profileId: 'p1',
                resumeText,
                stories: [story],
                targetRole: 'Frontend',
                jobDescription,
              })
            : new CoachAgent(model).invoke({
                sessionId: 's1',
                language: 'zh-CN',
                currentQuestion: question,
                answerText: resumeText,
                profileSummary: resumeText,
                jobSummary: jobDescription,
                priorCues: [
                  { ...cue, competency: 'project-depth', evidence: [{ source: 'answer', quote }] },
                ],
              });
      await expect(request).resolves.toMatchObject({ model: 'fake-model' });
    },
  );

  it('generates one bounded follow-up through InterviewerAgent after coaching a base question', async () => {
    const { model, calls } = fakeModel({
      coaching: cue,
      'follow-up': {
        question: { ...question, prompt: 'How did you validate LCP?', isCore: false },
      },
    });
    const workflow = new InterviewWorkflows(model);
    const result = await workflow.coach(
      {
        sessionId: 's1',
        language: 'zh-CN',
        currentQuestion: question,
        answerText: resumeText,
        profileSummary: resumeText,
        jobSummary: jobDescription,
        priorCues: [],
      },
      { operationId: 'turn-1' },
    );
    expect(calls).toEqual(['coaching', 'follow-up']);
    expect(result.followUp?.prompt).toBe('How did you validate LCP?');
    expect(result.followUp?.parentQuestionId).toBe('q1');
    expect(result.followUp?.isCore).toBe(false);
  });

  it('never chains another follow-up from a follow-up question', async () => {
    const { model, calls } = fakeModel({ coaching: cue });
    const result = await new InterviewWorkflows(model).coach(
      {
        sessionId: 's1',
        language: 'zh-CN',
        currentQuestion: { ...question, parentQuestionId: 'base1' },
        answerText: resumeText,
        profileSummary: resumeText,
        jobSummary: jobDescription,
        priorCues: [],
      },
      { operationId: 'turn-2' },
    );
    expect(calls).toEqual(['coaching']);
    expect(result.followUp).toBeNull();
  });

  it('requires all four competencies and a core question per dimension in a standard interview', async () => {
    const { model } = fakeModel({
      'question-generation': {
        questions: Array.from({ length: 8 }, (_, i) => ({ ...question, id: `q${i}` })),
      },
    });
    await expect(
      new InterviewWorkflows(model).questions(
        {
          targetRole: 'Frontend',
          language: 'zh-CN',
          round: 'technical',
          difficulty: 'l2',
          questionCount: 8,
          jobAnalysis: analysis,
          profileSummary: resumeText,
          stories: [],
        },
        { operationId: 'questions-1' },
      ),
    ).rejects.toThrow(/coverage|competenc|核心/i);
  });
});
