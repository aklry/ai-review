import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { IonicVue } from '@ionic/vue';
import { createRouter, createWebHashHistory } from 'vue-router';
import '@ionic/vue/css/core.css';
import '@ionic/vue/css/normalize.css';
import '@ionic/vue/css/structure.css';
import '@ionic/vue/css/typography.css';
import './styles.css';
import App from './App.vue';
import Library from './views/TrainingLibrary.vue';
import Training from './views/TrainingSession.vue';
import Review from './views/SessionReview.vue';
import Setup from './views/TrainingSetup.vue';
import Practice from './views/TrainingPractice.vue';

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: Library, props: { historyMode: false } },
    { path: '/records', component: Library, props: { historyMode: true } },
    { path: '/prepare', component: Setup },
    { path: '/training/:id', component: Training, props: true },
    { path: '/review/:id', component: Review, props: true },
    {
      path: '/practice/:sessionId/:questionId/:criterionId',
      component: Practice,
      props: (route) => ({
        ...route.params,
        language:
          route.query.language === 'en-US' || route.query.language === 'mixed'
            ? route.query.language
            : 'zh-CN',
      }),
    },
    {
      path: '/training',
      redirect: (to) =>
        to.query.sessionId
          ? `/training/${encodeURIComponent(String(to.query.sessionId))}`
          : '/prepare',
    },
    { path: '/history', redirect: '/records' },
    {
      path: '/history/:id',
      redirect: (to) => `/review/${encodeURIComponent(String(to.params.id))}`,
    },
    { path: '/settings', redirect: '/' },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});
router.beforeEach((to) => {
  if (to.path === '/records' && !to.query.status)
    return { path: '/records', query: { status: 'all' }, replace: true };
  return true;
});
const app = createApp(App).use(IonicVue).use(createPinia()).use(router);
void router.isReady().then(() => app.mount('#app'));
