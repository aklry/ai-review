<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { LearningFilter } from '@interview-assistant/contracts';
import { api, message } from '../connection';
const route = useRoute();
const result = ref<Awaited<ReturnType<typeof api.listLearning>>>();
const busy = ref(false);
const error = ref('');
const filter = ref<LearningFilter>('all');
let generation = 0;
const filters: Array<{ key: LearningFilter; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'bookmarked', label: '收藏' },
  { key: 'pending', label: '待练' },
  { key: 'mastered', label: '已掌握' },
  { key: 'progress', label: '进步对比' },
];
async function load(page = 1) {
  const ticket = ++generation;
  busy.value = true;
  error.value = '';
  try {
    const next = await api.listLearning(filter.value, page);
    if (ticket === generation) result.value = next;
  } catch (cause) {
    if (ticket === generation) error.value = message(cause);
  } finally {
    if (ticket === generation) busy.value = false;
  }
}
watch(
  () => route.query.filter,
  (value) => {
    filter.value = filters.some((entry) => entry.key === value) ? (value as LearningFilter) : 'all';
    result.value = undefined;
    void load();
  },
  { immediate: true },
);
onBeforeUnmount(() => generation++);
</script>
<template>
  <header>
    <router-link to="/">‹ 训练首页</router-link
    ><router-link to="/learn/daily">每日一练</router-link>
  </header>
  <h1>{{ filter === 'progress' ? '进步对比' : '错题与收藏本' }}</h1>
  <p class="muted">薄弱项会自动进入待练。掌握后可以自行标记，收藏与掌握状态互不影响。</p>
  <nav class="tabs filters" aria-label="练习筛选">
    <router-link
      v-for="entry in filters"
      :key="entry.key"
      :class="{ selected: filter === entry.key }"
      :to="{ path: '/learn', query: { filter: entry.key } }"
      >{{ entry.label }}</router-link
    >
  </nav>
  <p v-if="busy" role="status">正在读取练习…</p>
  <div v-else-if="error" role="alert">
    <p>{{ error }}</p>
    <button @click="load()">重试</button>
  </div>
  <template v-else-if="result">
    <section v-if="!result.items.length" class="panel">
      <h2>这里还没有练习</h2>
      <p>先完成每日一练，或在训练复盘中收藏一道题。</p>
      <router-link class="button-link" to="/learn/daily">开始每日一练</router-link>
    </section>
    <router-link
      v-for="item in result.items"
      :key="item.id"
      class="record"
      :to="'/learn/' + encodeURIComponent(item.id)"
    >
      <small
        >{{ item.bookmarked ? '已收藏 · ' : ''
        }}{{
          item.reviewStatus === 'mastered'
            ? '已掌握'
            : item.reviewStatus === 'pending'
              ? '待练'
              : '练习'
        }}
        · {{ item.question.difficulty.toUpperCase() }}</small
      >
      <h2>{{ item.question.prompt }}</h2>
      <p v-if="item.attemptCount > 1">
        首次 {{ item.firstScore }} → 最近 {{ item.latestScore }} / 5 ·
        {{ item.attemptCount }} 次作答
      </p>
      <p v-else>{{ item.attemptCount ? '已作答一次，再答一次后查看对比' : '尚未作答' }}</p>
      <strong>{{ filter === 'progress' ? '查看逐项变化' : '打开练习' }} ›</strong>
    </router-link>
    <div v-if="result.total > result.pageSize" class="pager">
      <button :disabled="result.page === 1" @click="load(result.page - 1)">上一页</button
      ><span>{{ result.page }} / {{ Math.ceil(result.total / result.pageSize) }}</span
      ><button
        :disabled="result.page * result.pageSize >= result.total"
        @click="load(result.page + 1)"
      >
        下一页
      </button>
    </div>
  </template>
</template>
