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

  <!-- 首页专属：AI 面试主卡 -->
  <section v-if="!historyMode" class="panel start-panel hero-agent-card">
    <div class="hero-top-row">
      <span class="ai-agent-pill-white">
        <span class="ai-pulse-dot" aria-hidden="true"></span>
        AI 面试 Agent 待命中
      </span>
      <span class="hero-spark">✦ 针对性追问</span>
    </div>
    <div class="hero-title-box">
      <small>下一场模拟面试</small>
      <h2>从手机开启全真模考</h2>
      <p class="hero-desc">输入目标岗位与简历，即刻生成贴合实战的考查链路与实时辅导。</p>
    </div>
    <router-link class="button-link primary-link start-cta-btn" to="/prepare">
      新建定制训练 ›
    </router-link>
  </section>

  <!-- 每日一练卡片 -->
  <section v-if="!historyMode" class="panel daily-drill-card">
    <div class="daily-header">
      <div class="daily-title-group">
        <span class="daily-badge">⚡ 每日微习惯</span>
        <h2>每日一练</h2>
      </div>
      <span class="daily-time-tag">3~5 分钟</span>
    </div>
    <p class="daily-desc">
      无需准备简历，直接攻克一道高频核心考题。优先巩固待练薄弱项，答完秒出逐项评分。
    </p>
    <router-link class="button-link primary-link daily-cta-btn" to="/learn/daily"
      >开始今日练习 ›</router-link
    >
    <div class="actions daily-actions">
      <router-link class="button-link sub-action-btn" to="/learn">错题与收藏本</router-link>
      <router-link class="button-link sub-action-btn" to="/learn?filter=progress"
        >进步对比</router-link
      >
    </div>
  </section>

  <!-- 记录模式筛选分类器 -->
  <nav v-if="historyMode" class="tabs filters history-filters" aria-label="记录状态">
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

  <p v-if="busy" class="loading-status" role="status">
    <span class="loading-spinner" aria-hidden="true"></span>
    正在读取训练列表…
  </p>
  <div v-else-if="error" class="panel error-panel">
    <p role="alert">{{ error }}</p>
    <button @click="load()">重试</button>
  </div>
  <template v-else>
    <!-- 空状态 -->
    <section v-if="!rows.length" class="panel empty-state-card">
      <div class="empty-icon-box">📂</div>
      <h2>{{ historyMode ? '没有符合条件的记录' : '暂无进行中的训练' }}</h2>
      <p>
        {{
          historyMode
            ? '调整上方筛选条件，或开启一场崭新的 AI 模拟面试。'
            : '新建面试训练后，即可在这里继续推进作答与随时查阅报告。'
        }}
      </p>
      <div class="actions empty-actions">
        <router-link v-if="historyMode" class="button-link primary-link" to="/prepare"
          >新建训练</router-link
        >
        <button @click="load()">刷新列表</button>
      </div>
    </section>

    <!-- 列表展示 -->
    <template v-else>
      <div class="section-heading list-heading">
        <h2>{{ historyMode ? '历史训练记录' : '继续训练与最近记录' }}</h2>
        <button class="quiet refresh-btn" @click="load()">刷新</button>
      </div>
      <div class="records-container">
        <router-link
          v-for="(row, i) in rows"
          :key="row.id"
          :to="destination(row)"
          class="record modern-record-card"
          :class="{ featured: !historyMode && i === 0 }"
        >
          <div class="record-top-row">
            <small class="record-date">
              {{ new Date(row.startedAt).toLocaleDateString('zh-CN') }}
              <template v-if="row.company"> · {{ row.company }}</template>
            </small>
            <span class="record-status-pill" :class="row.status">
              {{
                row.status === 'completed'
                  ? '已归档'
                  : row.status === 'awaiting_finish'
                    ? '待出报告'
                    : '进行中'
              }}
            </span>
          </div>

          <h3 class="record-title">{{ row.targetRole }}</h3>

          <div class="progress-wrapper">
            <progress
              :max="row.mainQuestionCount || 1"
              :value="row.answeredMainQuestionCount"
              aria-label="主问题进度"
            ></progress>
          </div>

          <div class="row record-footer-row">
            <span class="progress-count"
              >已答 {{ row.answeredMainQuestionCount }} / {{ row.mainQuestionCount }} 题</span
            >
            <span v-if="row.status === 'completed'" class="score-chip">
              评分 ·
              <strong>{{
                row.report?.overallScore ? Math.round(row.report.overallScore) : '未测评'
              }}</strong>
            </span>
            <strong class="action-label">{{ labels[row.status] }} ›</strong>
          </div>
        </router-link>
      </div>
    </template>

    <div v-if="historyMode && total > pageSize" class="pager modern-pager">
      <button :disabled="page === 1" @click="load(page - 1)">上一页</button>
      <span class="pager-info">{{ page }} / {{ Math.ceil(total / pageSize) }}</span>
      <button :disabled="page * pageSize >= total" @click="load(page + 1)">下一页</button>
    </div>
  </template>
</template>

<style scoped>
.hero-agent-card {
  padding: 24px 22px;
  border-radius: var(--radius-xl);
}

.hero-top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.ai-agent-pill-white {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 650;
  background: rgba(255, 255, 255, 0.2);
  color: #ffffff;
}

.hero-spark {
  font-size: 12px;
  color: var(--hero-muted);
}

.hero-title-box small {
  display: block;
  font-size: 13px;
  color: var(--hero-muted);
}

.hero-title-box h2 {
  margin: 4px 0 8px;
  font-size: 24px;
}

.hero-desc {
  font-size: 13.5px;
  color: var(--hero-muted);
  line-height: 1.5;
  margin: 0 0 16px;
}

.start-cta-btn {
  font-size: 15.5px;
  font-weight: 750;
  min-height: 48px;
}

/* 每日一练卡片 */
.daily-drill-card {
  padding: 20px 22px;
}

.daily-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.daily-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.daily-badge {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 700;
  background: var(--status-warn-bg);
  color: var(--status-warn);
}

.daily-drill-card h2 {
  margin: 0;
  font-size: 19px;
}

.daily-time-tag {
  font-size: 12px;
  color: var(--muted);
  font-weight: 550;
}

.daily-desc {
  font-size: 13.5px;
  color: var(--ink-secondary);
  line-height: 1.55;
  margin-bottom: 14px;
}

.daily-cta-btn {
  min-height: 46px;
  font-size: 15px;
}

.daily-actions {
  margin-top: 10px;
}

.sub-action-btn {
  font-size: 13.5px;
  min-height: 40px;
}

/* 列表与卡片 */
.list-heading {
  margin: 20px 0 10px;
}

.records-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.modern-record-card {
  padding: 18px 20px;
  margin: 0;
  border-radius: var(--radius-lg);
}

.record-top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.record-date {
  font-size: 12.5px;
}

.record-status-pill {
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 650;
  background: var(--accent-soft);
  color: var(--accent);
}

.record-status-pill.completed {
  background: var(--status-met-bg);
  color: var(--status-met);
}

.record-status-pill.awaiting_finish {
  background: var(--status-warn-bg);
  color: var(--status-warn);
}

.record-title {
  font-size: 17px;
  font-weight: 700;
  margin: 0 0 10px;
}

.progress-wrapper {
  margin: 6px 0;
}

.record-footer-row {
  margin-top: 8px;
  font-size: 13px;
}

.progress-count {
  font-variant-numeric: tabular-nums;
}

.score-chip {
  padding: 1px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  color: var(--accent);
  font-size: 12px;
}

.action-label {
  font-weight: 700;
}

/* 空状态卡片 */
.empty-state-card {
  text-align: center;
  padding: 36px 20px;
}

.empty-icon-box {
  font-size: 40px;
  margin-bottom: 12px;
}

.empty-state-card h2 {
  font-size: 18px;
  margin-bottom: 8px;
}

.empty-state-card p {
  color: var(--muted);
  max-width: 340px;
  margin: 0 auto 18px;
  font-size: 13.5px;
}

.empty-actions {
  justify-content: center;
}

/* 分页 */
.modern-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
}

.pager-info {
  font-size: 13.5px;
  font-variant-numeric: tabular-nums;
}
</style>
