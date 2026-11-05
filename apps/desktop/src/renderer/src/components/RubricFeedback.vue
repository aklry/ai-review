<script setup lang="ts">
import type { RubricEvaluation, RubricSnapshot } from '@interview-assistant/contracts';
defineProps<{ evaluation: RubricEvaluation; snapshot?: RubricSnapshot | null | undefined }>();
const labels = { met: '已满足', missing: '未说明', incorrect: '存在错误', unclear: '需要澄清' };
</script>

<template>
  <section class="rubric-feedback" aria-label="逐项评分依据">
    <h3>逐项评分依据</h3>
    <p class="history-muted">
      {{ evaluation.rubricVersion }} · 题目 {{ evaluation.bankId }} ·
      {{ evaluation.questionVersion }}
    </p>
    <p>基础 1 分，每项充分满足的标准加 1 分。</p>
    <article v-for="item in evaluation.items" :key="item.criterionId" class="rubric-item">
      <strong>{{
        snapshot?.criteria.find((criterion) => criterion.id === item.criterionId)?.description ??
        item.criterionId
      }}</strong>
      <p>
        <el-tag
          :type="
            item.status === 'met' ? 'success' : item.status === 'incorrect' ? 'danger' : 'warning'
          "
          size="small"
          >{{ labels[item.status] }}</el-tag
        >
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
  border-top: 1px solid #e2e8f0;
}
.rubric-item p {
  line-height: 1.7;
}
.rubric-item blockquote {
  margin: 8px 0;
  padding-left: 12px;
  border-left: 3px solid #94a3b8;
  white-space: pre-wrap;
}
.rubric-item small {
  color: #64748b;
}
</style>
