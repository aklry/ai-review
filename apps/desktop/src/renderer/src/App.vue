<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const activeRoute = computed(() => (route.path.startsWith('/history') ? '/history' : route.path));
</script>

<template>
  <el-container class="app-layout">
    <el-aside class="sidebar" width="224px">
      <div class="brand">
        <span class="brand-mark">IA</span>
        <div>
          <strong>Interview Assistant</strong>
          <small>Frontend + AI</small>
        </div>
      </div>
      <el-menu :default-active="activeRoute" router class="navigation">
        <el-menu-item index="/">工作台</el-menu-item>
        <el-menu-item index="/training">训练配置</el-menu-item>
        <el-menu-item index="/history">历史训练</el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-main class="main-content">
        <RouterView />
      </el-main>
    </el-container>
  </el-container>
</template>
