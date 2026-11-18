<script setup lang="ts">
import { IonApp, IonPage, IonContent } from '@ionic/vue';
import { RouterView, useRoute } from 'vue-router';

const route = useRoute();
</script>

<template>
  <ion-app>
    <ion-page>
      <ion-content :key="route.fullPath">
        <main>
          <router-view />
        </main>
      </ion-content>
    </ion-page>
  </ion-app>
</template>

<style>
ion-app,
ion-page {
  background: var(--paper);
  overflow-x: hidden;
}

ion-content {
  --background: var(--paper);
  --color: var(--ink);
  --keyboard-offset: 0px;
}

/* 全面隐藏 Ionic 与页面的滚动条，保持顺畅触控滑动 */
ion-content::part(scroll) {
  overflow-x: hidden;
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
  -webkit-overflow-scrolling: touch;
}

ion-content::part(scroll)::-webkit-scrollbar {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}
</style>
