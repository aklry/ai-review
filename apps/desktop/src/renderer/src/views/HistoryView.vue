<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue';
import { useHistoryStore } from '../stores/history.js';
import type { HistoryFilter } from '../stores/history.js';
import {
  formatInterviewDate,
  languageLabels,
  roundLabels,
  statusLabels,
} from '../lib/interview-labels.js';

const history = useHistoryStore();
onMounted(() => {
  void history.loadPage();
});
onBeforeUnmount(history.cancelList);
function filterChanged(status: HistoryFilter): void {
  void history.loadPage(1, status);
}
</script>

<template>
  <section class="view history-view" :aria-busy="history.listLoading">
    <header class="view-header">
      <div>
        <p class="eyebrow">回顾 · 复盘 · 继续训练</p>
        <h1>历史训练</h1>
      </div>
      <RouterLink to="/training" class="history-link">返回训练 →</RouterLink>
    </header>
    <div class="history-toolbar">
      <span>{{ history.total }} 场训练记录</span>
      <el-select
        :model-value="history.statusFilter"
        aria-label="筛选训练状态"
        placeholder="全部状态"
        style="width: 180px"
        @change="filterChanged"
      >
        <el-option label="全部状态" value="" />
        <el-option
          v-for="(label, status) in statusLabels"
          :key="status"
          :label="label"
          :value="status"
        />
      </el-select>
    </div>
    <el-skeleton v-if="history.listLoading" :rows="5" animated />
    <div v-else-if="history.listError" role="alert" class="history-error">
      <p>{{ history.listError }}</p>
      <el-button @click="history.loadPage()">重试</el-button>
    </div>
    <el-empty
      v-else-if="!history.items.length"
      :description="
        history.statusFilter
          ? '暂无符合条件的训练记录'
          : '还没有训练记录，完成一次模拟面试后回来复盘'
      "
    />
    <div v-else class="history-list">
      <article v-for="item in history.items" :key="item.id" class="history-card">
        <div class="history-card-heading">
          <div>
            <h2>{{ item.targetRole }}</h2>
            <p class="history-muted">
              {{ item.company ?? '未指定公司' }} · {{ formatInterviewDate(item.startedAt) }}
            </p>
          </div>
          <el-tag
            :type="
              item.status === 'completed'
                ? 'success'
                : item.status === 'active'
                  ? 'primary'
                  : 'warning'
            "
            >{{ statusLabels[item.status] }}</el-tag
          >
        </div>
        <div class="history-card-meta">
          <span
            >{{ languageLabels[item.language] }} · {{ roundLabels[item.round] }} ·
            {{ item.difficulty.toUpperCase() }}</span
          >
          <span
            >主问题
            <strong>{{ item.answeredMainQuestionCount }} / {{ item.mainQuestionCount }}</strong> ·
            追问 {{ item.followUpCount }} 次</span
          >
          <span v-if="item.report"
            >总分
            <strong>{{
              item.report.overallScore === null
                ? '未测评'
                : `${Math.round(item.report.overallScore)} / 100`
            }}</strong></span
          >
          <span v-else class="history-muted">尚未生成报告</span>
        </div>
        <div class="history-actions">
          <small class="history-muted">{{
            item.report?.scoringVersion ?? '追问不重复计入主问题均分'
          }}</small>
          <RouterLink :to="`/history/${encodeURIComponent(item.id)}`" class="history-link"
            >查看逐题复盘 →</RouterLink
          >
        </div>
      </article>
    </div>
    <el-pagination
      v-if="history.total > history.pageSize && !history.listError"
      class="history-pagination"
      layout="total, prev, pager, next"
      :total="history.total"
      :page-size="history.pageSize"
      :current-page="history.page"
      :disabled="history.listLoading"
      @current-change="history.loadPage($event)"
    />
  </section>
</template>
