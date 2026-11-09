<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { SessionHistoryItem } from '@interview-assistant/contracts';
import { api, message } from '../connection';
const props = defineProps<{ historyMode: boolean }>();
const route = useRoute();
const rows = ref<SessionHistoryItem[]>([]);
const busy = ref(true);
const error = ref('');
const page = ref(1);
const total = ref(0);
const pageSize = 10;
const selectedStatus = computed(() => {
  const raw = route.query.status;
  return raw === 'active' || raw === 'awaiting_finish' || raw === 'completed' ? raw : 'all';
});
let revision = 0;

async function load(next = page.value) {
  const ticket = ++revision;
  busy.value = true;
  error.value = '';
  try {
    if (props.historyMode) {
      const result = await api.getSessionHistory({
        page: next,
        pageSize,
        ...(selectedStatus.value !== 'all' ? { status: selectedStatus.value } : {}),
      });
      if (ticket !== revision) return;
      rows.value = result.items;
      total.value = result.total;
      page.value = next;
    } else {
      const [active, waiting, recent] = await Promise.all([
        api.getSessionHistory({ page: 1, pageSize: 5, status: 'active' }),
        api.getSessionHistory({ page: 1, pageSize: 5, status: 'awaiting_finish' }),
        api.getSessionHistory({ page: 1, pageSize: 3, status: 'completed' }),
      ]);
      if (ticket !== revision) return;
      rows.value = [...active.items, ...waiting.items]
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .concat(recent.items);
    }
  } catch (e) {
    if (ticket === revision) error.value = message(e);
  } finally {
    if (ticket === revision) busy.value = false;
  }
}
function destination(row: SessionHistoryItem) {
  return (row.status === 'completed' ? '/review/' : '/training/') + encodeURIComponent(row.id);
}
const labels = { active: '继续训练', awaiting_finish: '生成报告', completed: '查看复盘' };
onMounted(() => void load());
watch(selectedStatus, () => void load(1));
watch(
  () => props.historyMode,
  () => void load(1),
);
onBeforeUnmount(() => {
  ++revision;
});
</script>
<template>
  <header>
    <h1>{{ historyMode ? '训练记录' : '面试训练' }}</h1>
    <router-link v-if="historyMode" to="/">训练首页</router-link>
    <router-link v-else to="/records">全部记录</router-link>
  </header>
  <nav class="tabs" aria-label="主导航">
    <router-link to="/">训练</router-link><router-link to="/records">记录</router-link>
  </nav>
  <section v-if="!historyMode" class="panel start-panel">
    <div>
      <small>下一场面试</small>
      <h2>从手机开始训练</h2>
    </div>
    <router-link class="button-link primary-link" to="/prepare">新建训练</router-link>
  </section>
  <nav v-if="historyMode" class="tabs filters" aria-label="记录状态">
    <router-link
      :class="{ selected: selectedStatus === 'all' }"
      :to="{ path: '/records', query: { status: 'all' } }"
      >全部</router-link
    >
    <router-link
      :class="{ selected: selectedStatus === 'active' }"
      :to="{ path: '/records', query: { status: 'active' } }"
      >进行中</router-link
    >
    <router-link
      :class="{ selected: selectedStatus === 'awaiting_finish' }"
      :to="{ path: '/records', query: { status: 'awaiting_finish' } }"
      >待生成报告</router-link
    >
    <router-link
      :class="{ selected: selectedStatus === 'completed' }"
      :to="{ path: '/records', query: { status: 'completed' } }"
      >已完成</router-link
    >
  </nav>
  <p v-if="busy" role="status">正在读取训练…</p>
  <div v-else-if="error" class="panel">
    <p role="alert">{{ error }}</p>
    <button @click="load()">重试</button>
  </div>
  <template v-else>
    <section v-if="!rows.length" class="panel">
      <h2>{{ historyMode ? '没有符合条件的记录' : '没有进行中的训练' }}</h2>
      <p>
        {{
          historyMode
            ? '调整记录筛选条件，或开始一场新训练。'
            : '新建训练后，可以在这里继续答题和查看报告。'
        }}
      </p>
      <div class="actions">
        <router-link v-if="historyMode" class="button-link" to="/prepare">新建训练</router-link>
        <button @click="load()">刷新训练</button>
      </div>
    </section>
    <template v-else>
      <div class="section-heading">
        <h2>{{ historyMode ? '训练记录' : '继续训练与最近记录' }}</h2>
        <button class="quiet" @click="load()">刷新</button>
      </div>
      <router-link
        v-for="(row, i) in rows"
        :key="row.id"
        :to="destination(row)"
        class="record"
        :class="{ featured: !historyMode && i === 0 }"
      >
        <small
          >{{ new Date(row.startedAt).toLocaleDateString('zh-CN')
          }}<template v-if="row.company"> · {{ row.company }}</template></small
        >
        <h3>{{ row.targetRole }}</h3>
        <progress
          :max="row.mainQuestionCount || 1"
          :value="row.answeredMainQuestionCount"
          aria-label="主问题进度"
        ></progress>
        <div class="row">
          <span>已答 {{ row.answeredMainQuestionCount }} / {{ row.mainQuestionCount }} 题</span>
          <span v-if="row.status === 'completed'"
            >评分 · {{ row.report?.overallScore ?? '未测评' }}</span
          >
          <strong>{{ labels[row.status] }} ›</strong>
        </div>
      </router-link>
    </template>
    <div v-if="historyMode && total > pageSize" class="pager">
      <button :disabled="page === 1" @click="load(page - 1)">上一页</button
      ><span>{{ page }} / {{ Math.ceil(total / pageSize) }}</span
      ><button :disabled="page * pageSize >= total" @click="load(page + 1)">下一页</button>
    </div>
  </template>
</template>
