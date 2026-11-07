<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import type { SessionHistoryItem } from '@interview-assistant/contracts';
import { api, message } from '../connection';
const props = defineProps<{ historyMode: boolean }>();
const rows = ref<SessionHistoryItem[]>([]);
const busy = ref(true);
const error = ref('');
const page = ref(1);
const total = ref(0);
const pageSize = 10;
let revision = 0;

async function load(next = page.value) {
  const ticket = ++revision;
  busy.value = true;
  error.value = '';
  try {
    if (props.historyMode) {
      const result = await api.getSessionHistory({ page: next, pageSize });
      if (ticket !== revision) return;
      rows.value = result.items;
      total.value = result.total;
      page.value = next;
    } else {
      const [active, waiting] = await Promise.all([
        api.getSessionHistory({ page: 1, pageSize: 5, status: 'active' }),
        api.getSessionHistory({ page: 1, pageSize: 5, status: 'awaiting_finish' }),
      ]);
      if (ticket !== revision) return;
      rows.value = [...active.items, ...waiting.items].sort((a, b) =>
        b.startedAt.localeCompare(a.startedAt),
      );
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
onBeforeUnmount(() => {
  ++revision;
});
</script>
<template>
  <header>
    <h1>{{ historyMode ? '训练记录' : '面试训练' }}</h1>
    <router-link to="/settings">连接设置</router-link>
  </header>
  <nav class="tabs" aria-label="主导航">
    <router-link to="/">训练</router-link><router-link to="/records">记录</router-link>
  </nav>
  <p v-if="busy" role="status">正在读取训练…</p>
  <div v-else-if="error" class="panel">
    <p role="alert">{{ error }}</p>
    <button @click="load()">重试</button>
  </div>
  <template v-else>
    <section v-if="!rows.length" class="panel">
      <h2>{{ historyMode ? '还没有训练记录' : '没有进行中的训练' }}</h2>
      <p>在桌面端创建一场训练，再回到这里刷新。</p>
      <button @click="load()">刷新训练</button>
    </section>
    <template v-else>
      <div class="section-heading">
        <h2>{{ historyMode ? '全部记录' : '待完成' }}</h2>
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
          <span>已答 {{ row.answeredMainQuestionCount }} / {{ row.mainQuestionCount }} 题</span
          ><strong>{{ labels[row.status] }} ›</strong>
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
