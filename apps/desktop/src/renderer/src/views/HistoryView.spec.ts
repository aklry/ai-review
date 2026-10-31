import { describe, expect, it } from 'vitest';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import ElementPlus, { ID_INJECTION_KEY } from 'element-plus';
import HistoryView from './HistoryView.vue';
import SessionReviewView from './SessionReviewView.vue';
import { useHistoryStore } from '../stores/history.js';
import type { SessionReview } from '@interview-assistant/contracts';

function setup() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return pinia;
}
async function render(component: typeof HistoryView | typeof SessionReviewView, props = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: HistoryView }],
  });
  await router.push('/history');
  return renderToString(
    createSSRApp(component, props)
      .use(piniaForRender)
      .use(router)
      .use(ElementPlus)
      .provide(ID_INJECTION_KEY, { prefix: 100, current: 0 }),
  );
}
let piniaForRender: ReturnType<typeof setup>;

describe('history and review views', () => {
  it('shows empty and retryable error states', async () => {
    piniaForRender = setup();
    expect(await render(HistoryView)).toContain('还没有训练记录');
    useHistoryStore().listError = '网络暂不可用';
    const html = await render(HistoryView);
    expect(html).toContain('网络暂不可用');
    expect(html).toContain('重试');
    expect(html).not.toContain('还没有训练记录');
  });

  it('renders main-question progress and a nullable report score', async () => {
    piniaForRender = setup();
    const store = useHistoryStore();
    store.items = [
      {
        id: 's1',
        status: 'completed',
        targetRole: '前端工程师',
        company: '示例公司',
        language: 'zh-CN',
        round: 'technical',
        difficulty: 'l2',
        startedAt: '2026-10-29T01:00:00.000Z',
        endedAt: null,
        mainQuestionCount: 4,
        answeredMainQuestionCount: 1,
        followUpCount: 1,
        report: { overallScore: null, scoringVersion: 'evidence-v2' },
      },
    ];
    store.total = 1;
    const html = await render(HistoryView);
    expect(html).toContain('前端工程师');
    expect(html).toContain('1 / 4');
    expect(html).toContain('未测评');
    expect(html).toContain('/history/s1');
  });

  it('reviews main questions, unanswered questions, associated follow-ups and every evidence quote', async () => {
    piniaForRender = setup();
    const cue = {
      competency: 'project-depth' as const,
      score: 4,
      strengths: ['结果明确'],
      gaps: ['补充方法'],
      nextAction: '解释测量方法',
      evidence: [
        { source: 'answer' as const, quote: '第一条证据' },
        { source: 'answer' as const, quote: '第二条证据' },
      ],
    };
    useHistoryStore().review = {
      id: 's1',
      status: 'active',
      targetRole: '前端工程师',
      company: null,
      language: 'zh-CN',
      round: 'technical',
      difficulty: 'l2',
      startedAt: '2026-10-29T01:00:00.000Z',
      endedAt: null,
      mainQuestionCount: 2,
      answeredMainQuestionCount: 1,
      followUpCount: 1,
      activeQuestionId: 'followup',
      report: null,
      questions: [
        {
          id: 'q1',
          parentQuestionId: null,
          competency: 'project-depth',
          difficulty: 'l2',
          isCore: true,
          prompt: '介绍你的项目',
          answer: { answerText: '我的完整回答', createdAt: '2026-10-29T01:01:00.000Z', cue },
        },
        {
          id: 'q2',
          parentQuestionId: null,
          competency: 'system-design',
          difficulty: 'l2',
          isCore: true,
          prompt: '设计缓存系统',
          answer: null,
        },
        {
          id: 'followup',
          parentQuestionId: 'q1',
          competency: 'project-depth',
          difficulty: 'l2',
          isCore: false,
          prompt: '你如何测量？',
          answer: null,
        },
      ],
    } satisfies SessionReview;
    const html = await render(SessionReviewView, { sessionId: 's1' });
    expect(html).toContain('我的完整回答');
    expect(html).toContain('第一条证据');
    expect(html).toContain('第二条证据');
    expect(html).toContain('未作答');
    expect(html).toContain('主问题 1 的追问');
    expect(html.indexOf('你如何测量？')).toBeLessThan(html.indexOf('设计缓存系统'));
    expect(html).toContain('sessionId=s1');
  });
});
