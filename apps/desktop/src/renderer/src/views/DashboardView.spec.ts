import { beforeEach, describe, expect, it } from 'vitest';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import ElementPlus, { ID_INJECTION_KEY } from 'element-plus';
import DashboardView from './DashboardView.vue';
import { useDashboardStore } from '../stores/dashboard.js';

let pinia: ReturnType<typeof createPinia>;
async function render() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: DashboardView }],
  });
  await router.push('/');
  return renderToString(
    createSSRApp(DashboardView)
      .use(pinia)
      .use(router)
      .use(ElementPlus)
      .provide(ID_INJECTION_KEY, { prefix: 100, current: 0 }),
  );
}

describe('dashboard states and destinations', () => {
  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
  });

  it('shows onboarding only after a successful empty load and no diagnostic or score panels', async () => {
    expect(await render()).toContain('正在读取训练进度');
    useDashboardStore().loading = false;
    const html = await render();
    expect(html).toContain('开始首次训练');
    expect(html).toContain('还没有训练记录');
    expect(html).not.toContain('检查 API');
    expect(html).not.toContain('首版能力权重');
    useDashboardStore().error = true;
    const failed = await render();
    expect(failed).toContain('重新加载');
    expect(failed).not.toContain('开始首次训练');
    expect(failed).not.toContain('还没有训练记录');
  });

  it('links pending sessions to recovery and completed sessions to review without displaying scores', async () => {
    const store = useDashboardStore();
    store.loading = false;
    const pending = {
      id: 'pending',
      status: 'awaiting_finish' as const,
      targetRole: '前端工程师',
      company: null,
      language: 'zh-CN' as const,
      round: 'technical' as const,
      difficulty: 'l2' as const,
      startedAt: '2026-11-05T03:00:00.000Z',
      endedAt: null,
      mainQuestionCount: 4,
      answeredMainQuestionCount: 4,
      followUpCount: 2,
      report: null,
    };
    const completed = {
      ...pending,
      id: 'done',
      status: 'completed' as const,
      report: { overallScore: 87, scoringVersion: 'rubric-v3' },
    };
    store.resumeSession = pending;
    store.latestCompleted = completed;
    store.recentSessions = [pending, completed];
    const html = await render();
    expect(html).toContain('前往生成报告');
    expect(html).toContain('/training?sessionId=pending');
    expect(html).toContain('/history/done');
    expect(html).toContain('4 / 4');
    expect(html).not.toContain('87');
    expect(html).not.toContain('rubric-v3');
  });
});
