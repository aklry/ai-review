<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { scoreWeights, type Competency } from '@interview-assistant/contracts';
import { useSystemStore } from '../stores/system.js';

const systemStore = useSystemStore();
const { errorMessage, health, status } = storeToRefs(systemStore);
const apiBaseUrl = window.desktopApi.apiBaseUrl;

const competencies: Array<{ key: Competency; label: string; note: string }> = [
  { key: 'project-depth', label: '项目深度', note: '贡献、取舍、结果与复盘' },
  { key: 'system-design', label: '系统设计', note: '架构、稳定性与容量估算' },
  { key: 'ai-application', label: 'AI 应用', note: 'RAG、Agent、评估与安全' },
  { key: 'vue-react', label: 'Vue / React', note: '框架、工程化与性能优化' },
];

const statusType = computed(() => {
  if (status.value === 'online') return 'success';
  if (status.value === 'offline') return 'danger';
  if (status.value === 'checking') return 'warning';
  return 'info';
});

const statusLabel = computed(() => {
  const labels = {
    idle: '未检查',
    checking: '检查中',
    online: 'API 在线',
    offline: 'API 离线',
  };
  return labels[status.value];
});

onMounted(() => {
  void systemStore.checkApi();
});
</script>

<template>
  <section class="view">
    <header class="view-header">
      <div>
        <p class="eyebrow">3-5 年经验 · 前端 + AI</p>
        <h1>面试训练工作台</h1>
      </div>
      <el-button type="primary" :loading="status === 'checking'" @click="systemStore.checkApi">
        检查 API
      </el-button>
    </header>

    <el-alert
      v-if="errorMessage"
      class="api-alert"
      type="error"
      :closable="false"
      show-icon
      :title="errorMessage"
    />

    <section class="runtime-panel" aria-label="服务状态">
      <div>
        <p class="section-label">服务状态</p>
        <strong>{{ health?.service ?? 'interview-assistant-api' }}</strong>
      </div>
      <div class="runtime-meta">
        <el-tag :type="statusType" effect="light">{{ statusLabel }}</el-tag>
        <span>{{ apiBaseUrl }}</span>
      </div>
    </section>

    <section class="section-heading">
      <div>
        <p class="section-label">评分维度</p>
        <h2>首版能力权重</h2>
      </div>
      <span class="total-weight">100%</span>
    </section>

    <section class="competency-grid" aria-label="评分维度列表">
      <article v-for="item in competencies" :key="item.key" class="competency">
        <div class="competency-head">
          <strong>{{ item.label }}</strong>
          <span>{{ scoreWeights[item.key] }}%</span>
        </div>
        <p>{{ item.note }}</p>
        <el-progress
          :percentage="scoreWeights[item.key]"
          :show-text="false"
          :stroke-width="6"
          color="#1565c0"
        />
      </article>
    </section>
  </section>
</template>
