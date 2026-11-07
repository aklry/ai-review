<script setup lang="ts">
import { IonApp, IonPage, IonContent } from '@ionic/vue';
import { RouterView, useRoute } from 'vue-router';
const route = useRoute();
</script>
<template>
  <ion-app
    ><ion-page
      ><ion-content :key="route.fullPath">
        <main><router-view /></main> </ion-content></ion-page
  ></ion-app>
</template>
