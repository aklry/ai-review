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
  { key: 'all', label: '全部题目' },
  { key: 'bookmarked', label: '⭐ 收藏' },
  { key: 'pending', label: '⏳ 待练' },
  { key: 'mastered', label: '✓ 已掌握' },
  { key: 'progress', label: '📈 进步对比' },
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
    <router-link to="/">‹ 训练首页</router-link>
    <router-link to="/learn/daily">每日一练 ›</router-link>
  </header>

  <div class="learn-hero-banner">
    <div class="learn-hero-badge">
      <span class="ai-pulse-dot"></span>
      智能知识库
    </div>
    <h1 class="learn-hero-title">
      {{ filter === 'progress' ? '历次进步轨迹对比' : '错题与专项收藏本' }}
    </h1>
    <p class="learn-hero-desc">
      模拟面试与练习中表现薄弱的考点自动沉淀于此，通过针对性重答彻底攻克。
    </p>
  </div>

  <nav class="tabs filters modern-learn-filters" aria-label="练习筛选">
    <router-link
      v-for="entry in filters"
      :key="entry.key"
      :class="{ selected: filter === entry.key }"
      :to="{ path: '/learn', query: { filter: entry.key } }"
    >
      {{ entry.label }}
    </router-link>
  </nav>

  <p v-if="busy" class="loading-status" role="status">
    <span class="loading-spinner" aria-hidden="true"></span>
    正在读取练习题目…
  </p>
  <div v-else-if="error" class="panel error-panel" role="alert">
    <p>{{ error }}</p>
    <button @click="load()">重试</button>
  </div>
  <template v-else-if="result">
    <!-- 空状态 -->
    <section v-if="!result.items.length" class="panel empty-box">
      <div class="empty-icon">📚</div>
      <h2>这里还没有相关练习题目</h2>
      <p>先完成一次每日一练，或在全真面试复盘中收藏重点题目。</p>
      <router-link class="button-link primary-link start-daily-btn" to="/learn/daily"
        >开始每日一练 ›</router-link
      >
    </section>

    <!-- 练习题目列表 -->
    <div class="learn-items-container">
      <router-link
        v-for="item in result.items"
        :key="item.id"
        class="record modern-learn-card"
        :to="'/learn/' + encodeURIComponent(item.id)"
      >
        <div class="learn-card-top">
          <div class="status-tags-group">
            <span v-if="item.bookmarked" class="bookmark-tag">⭐ 已收藏</span>
            <span class="review-status-tag" :class="item.reviewStatus">
              {{
                item.reviewStatus === 'mastered'
                  ? '已掌握'
                  : item.reviewStatus === 'pending'
                    ? '待巩固'
                    : '练习中'
              }}
            </span>
            <span class="diff-tag">{{ item.question.difficulty.toUpperCase() }}</span>
          </div>
          <span v-if="item.attemptCount" class="attempts-count-tag"
            >{{ item.attemptCount }} 次作答</span
          >
        </div>

        <h2 class="learn-prompt">{{ item.question.prompt }}</h2>

        <div class="learn-score-row">
          <div v-if="item.attemptCount > 1" class="score-evolution">
            <span class="score-pill first">首次 {{ item.firstScore }}</span>
            <span class="arrow-sep">→</span>
            <span class="score-pill latest">最新 {{ item.latestScore }} / 5</span>
          </div>
          <p v-else class="single-attempt-hint">
            {{ item.attemptCount ? '已作答 1 次，再答一次即刻生成逐项对比' : '尚未开始作答' }}
          </p>

          <strong class="action-arrow"
            >{{ filter === 'progress' ? '查看逐项变化' : '打开练习' }} ›</strong
          >
        </div>
      </router-link>
    </div>

    <!-- 分页器 -->
    <div v-if="result.total > result.pageSize" class="pager modern-pager">
      <button :disabled="result.page === 1" @click="load(result.page - 1)">上一页</button>
      <span class="pager-text"
        >{{ result.page }} / {{ Math.ceil(result.total / result.pageSize) }}</span
      >
      <button
        :disabled="result.page * result.pageSize >= result.total"
        @click="load(result.page + 1)"
      >
        下一页
      </button>
    </div>
  </template>
</template>

<style scoped>
.learn-hero-banner {
  padding: 18px 20px;
  margin-bottom: 16px;
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px solid var(--card-border);
  box-shadow: var(--shadow-sm);
}

.learn-hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 700;
  background: var(--accent-soft);
  color: var(--accent);
  margin-bottom: 8px;
}

.learn-hero-title {
  font-size: 20px;
  margin: 0 0 6px;
  font-weight: 800;
}

.learn-hero-desc {
  font-size: 13px;
  color: var(--muted);
  margin: 0;
  line-height: 1.5;
}

/* 筛选分类栏 */
.modern-learn-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.modern-learn-filters a {
  flex: 1 1 calc(33% - 6px);
  min-height: 38px;
  padding: 6px 10px;
  font-size: 13px;
}

/* 列表容器 */
.learn-items-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.modern-learn-card {
  padding: 18px 20px;
  margin: 0;
  border-radius: var(--radius-lg);
}

.learn-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.status-tags-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.bookmark-tag {
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  background: #fff8e6;
  color: #b37400;
}

.review-status-tag {
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  background: color-mix(in srgb, var(--ink) 6%, var(--surface));
  color: var(--muted);
}

.review-status-tag.mastered {
  background: var(--status-met-bg);
  color: var(--status-met);
}

.review-status-tag.pending {
  background: var(--status-warn-bg);
  color: var(--status-warn);
}

.diff-tag {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  background: color-mix(in srgb, var(--ink) 4%, var(--surface));
}

.attempts-count-tag {
  font-size: 12px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.learn-prompt {
  font-size: 16px;
  line-height: 1.45;
  margin: 0 0 12px;
  font-weight: 700;
  color: var(--ink);
}

.learn-score-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  margin-top: 6px;
}

.score-evolution {
  display: flex;
  align-items: center;
  gap: 6px;
}

.score-pill {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.score-pill.first {
  background: color-mix(in srgb, var(--ink) 6%, var(--surface));
  color: var(--muted);
}

.score-pill.latest {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 750;
}

.arrow-sep {
  color: var(--muted);
  font-size: 12px;
}

.single-attempt-hint {
  margin: 0;
  font-size: 12.5px;
  color: var(--muted);
}

.action-arrow {
  color: var(--accent);
  font-weight: 700;
  white-space: nowrap;
}

/* 空状态 */
.empty-box {
  text-align: center;
  padding: 36px 20px;
}

.empty-icon {
  font-size: 40px;
  margin-bottom: 10px;
}

.empty-box h2 {
  font-size: 18px;
  margin-bottom: 6px;
}

.empty-box p {
  color: var(--muted);
  max-width: 320px;
  margin: 0 auto 16px;
  font-size: 13px;
}

.start-daily-btn {
  max-width: 220px;
  margin: 0 auto;
}

/* 分页器 */
.modern-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 20px;
}

.pager-text {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
</style>
