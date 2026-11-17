<script setup lang="ts">
import type { RubricEvaluation, RubricSnapshot } from '@interview-assistant/contracts';

defineProps<{ evaluation: RubricEvaluation; snapshot?: RubricSnapshot | null | undefined }>();
const labels = { met: '已满足', missing: '未说明', incorrect: '存在错误', unclear: '需要澄清' };
</script>

<template>
  <section class="rubric-feedback" aria-label="逐项评分依据">
    <h3>逐项评分依据</h3>
    <small
      >{{ evaluation.rubricVersion }} · 题目 {{ evaluation.bankId }} ·
      {{ evaluation.questionVersion }}</small
    >
    <article v-for="item in evaluation.items" :key="item.criterionId" class="rubric-item">
      <strong>{{
        snapshot?.criteria.find((criterion) => criterion.id === item.criterionId)?.description ??
        item.criterionId
      }}</strong>
      <p>
        <span class="rubric-status" :class="item.status">{{ labels[item.status] }}</span>
        {{ item.reason }}
      </p>
      <blockquote v-for="quote in item.quotes" :key="quote">{{ quote }}</blockquote>
      <small v-if="item.status === 'missing'">本次回答尚未提供此项依据。</small>
    </article>
  </section>
</template>

<style scoped>
.rubric-feedback {
  overflow-wrap: anywhere;
}
.rubric-item {
  padding: 14px 0;
  border-top: 1px solid var(--line);
}
.rubric-item p {
  line-height: 1.7;
}
.rubric-status {
  display: inline-flex;
  align-items: center;
  margin-inline-end: 6px;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.7;
  vertical-align: 1px;
}
.rubric-status.met {
  color: var(--status-met);
  background: var(--status-met-bg);
}
.rubric-status.missing,
.rubric-status.unclear {
  color: var(--status-warn);
  background: var(--status-warn-bg);
}
.rubric-status.incorrect {
  color: var(--status-bad);
  background: var(--status-bad-bg);
}
</style>
