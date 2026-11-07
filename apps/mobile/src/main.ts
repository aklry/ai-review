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
import Connection from './views/ConnectionSettings.vue';
import Training from './views/TrainingSession.vue';
import Review from './views/SessionReview.vue';
import { address } from './connection';

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: Library, props: { historyMode: false } },
    { path: '/records', component: Library, props: { historyMode: true } },
    { path: '/settings', component: Connection },
    { path: '/training/:id', component: Training, props: true },
    { path: '/review/:id', component: Review, props: true },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});
router.beforeEach((to) => (!address.value && to.path !== '/settings' ? '/settings' : true));
const app = createApp(App).use(IonicVue).use(createPinia()).use(router);
void router.isReady().then(() => app.mount('#app'));
