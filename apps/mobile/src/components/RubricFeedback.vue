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
  padding: 12px 0;
  border-top: 1px solid var(--line);
}
.rubric-item p {
  line-height: 1.7;
}
.rubric-status {
  font-weight: 700;
}
.rubric-status.met {
  color: #1c6a46;
}
.rubric-status.missing,
.rubric-status.unclear {
  color: #8a6510;
}
.rubric-status.incorrect {
  color: #963e32;
}
</style>
