import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import ElementPlus, { ID_INJECTION_KEY } from 'element-plus';
import TrainingView from './TrainingView.vue';
import { useTrainingStore } from '../stores/training.js';

describe('training view state', () => {
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
  });

  afterEach(() => {
    useTrainingStore().$dispose();
  });

  it('shows unanswered dimensions and total as 未测评 without rendering zero score bars', async () => {
    const store = useTrainingStore();
    store.phase = 'report';
    store.report = {
      summary: 'Not enough evidence.',
      overallScore: null,
      competencyScores: {
        'vue-react': null,
        'ai-application': null,
        'system-design': null,
        'project-depth': 4,
      },
      cues: [],
      strengths: [],
      gaps: [],
      nextPlan: [],
      scoringVersion: 'evidence-v2',
      assessmentStatus: 'partial',
    };

    const html = await renderToString(
      createSSRApp(TrainingView)
        .use(pinia)
        .use(createRouter({ history: createMemoryHistory(), routes: [] }))
        .use(ElementPlus)
        .provide(ID_INJECTION_KEY, { prefix: 100, current: 0 }),
    );

    expect(html.match(/未测评/g)).toHaveLength(4);
    expect(html).not.toContain('0<small>/100');
    expect(html.match(/role="progressbar"/g)).toHaveLength(1);
    expect(html).toContain('evidence-v2');
  });

  it('shows the answered-complete state and disables both text input and answer submission', async () => {
    const store = useTrainingStore();
    store.phase = 'interview';
    store.sessionId = 'session_1';
    store.session = {
      id: 'session_1',
      status: 'awaiting_finish',
      currentQuestionIndex: 2,
      activeQuestionId: null,
      version: 3,
      questions: [],
      plan: {
        profileId: 'profile_1',
        jobId: 'job_1',
        language: 'zh-CN',
        round: 'technical',
        difficulty: 'l2',
        profile: { resumeText: 'Private resume' },
        job: {
          targetRole: 'Frontend',
          company: null,
          description: 'JD',
          analysis: null,
          analysisStatus: 'completed',
        },
      },
    };
    store.currentQuestion = null;
    store.answerText = 'Accidental old draft';

    const html = await renderToString(
      createSSRApp(TrainingView)
        .use(pinia)
        .use(createRouter({ history: createMemoryHistory(), routes: [] }))
        .use(ElementPlus)
        .provide(ID_INJECTION_KEY, { prefix: 100, current: 0 }),
    );

    expect(html).toContain('所有题目已完成');
    expect(html).toMatch(/<textarea[^>]*disabled/);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[\s\S]*?提交回答/);
    expect(html).toContain('结束并生成报告');
  });
});
