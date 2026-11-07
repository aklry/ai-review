import { createRouter, createWebHashHistory } from 'vue-router';
import DashboardView from '../views/DashboardView.vue';
import TrainingView from '../views/TrainingView.vue';
import HistoryView from '../views/HistoryView.vue';
import SessionReviewView from '../views/SessionReviewView.vue';

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: DashboardView,
    },
    {
      path: '/training',
      name: 'training',
      component: TrainingView,
      props: (route) => ({
        resumeSessionId:
          typeof route.query.sessionId === 'string' ? route.query.sessionId : undefined,
      }),
    },
    {
      path: '/history/:sessionId/practice/:questionId/:criterionId',
      name: 'practice',
      component: () => import('../views/PracticeView.vue'),
      props: true,
    },
    { path: '/history', name: 'history', component: HistoryView },
    {
      path: '/history/:sessionId',
      name: 'session-review',
      component: SessionReviewView,
      props: true,
    },
  ],
});
