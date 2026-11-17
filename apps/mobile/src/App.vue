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

ion-content::part(scroll) {
  overflow-x: hidden;
}
</style>
