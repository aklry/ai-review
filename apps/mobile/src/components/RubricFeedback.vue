<script setup lang="ts">
import type { RubricEvaluation, RubricSnapshot } from '@interview-assistant/contracts';

defineProps<{ evaluation: RubricEvaluation; snapshot?: RubricSnapshot | null | undefined }>();
const labels = { met: '已满足', missing: '未说明', incorrect: '存在错误', unclear: '需要澄清' };
</script>

<template>
  <section class="rubric-feedback" aria-label="逐项评分依据">
    <div class="rubric-header">
      <div class="rubric-title-group">
        <span class="rubric-icon">📐</span>
        <h3>逐项评分依据</h3>
      </div>
      <small class="rubric-version-tag">
        标准 {{ evaluation.rubricVersion }} · 题库 {{ evaluation.bankId }}
      </small>
    </div>

    <div class="rubric-items-container">
      <article
        v-for="item in evaluation.items"
        :key="item.criterionId"
        class="rubric-item"
        :class="item.status"
      >
        <div class="item-head">
          <strong class="item-desc">
            {{
              snapshot?.criteria.find((criterion) => criterion.id === item.criterionId)?.description ??
              item.criterionId
            }}
          </strong>
          <span class="rubric-status" :class="item.status">
            <span class="status-indicator-dot"></span>
            {{ labels[item.status] }}
          </span>
        </div>
        <p class="reason-text">{{ item.reason }}</p>
        <div v-if="item.quotes.length" class="quotes-group">
          <blockquote v-for="quote in item.quotes" :key="quote">
            <span class="quote-mark">“</span>{{ quote }}<span class="quote-mark">”</span>
          </blockquote>
        </div>
        <div v-if="item.status === 'missing'" class="missing-hint">
          <span class="missing-icon">⚠️</span>
          <span>本次回答尚未针对此考查点提供依据，建议补充具体案例或技术细节。</span>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.rubric-feedback {
  overflow-wrap: anywhere;
  margin: 14px 0;
  padding: 16px;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--ink) 2%, var(--surface));
  border: 1px solid var(--line);
}

.rubric-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.rubric-title-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.rubric-icon {
  font-size: 15px;
}

.rubric-header h3 {
  font-size: 14.5px;
  font-weight: 750;
  margin: 0;
  color: var(--ink);
}

.rubric-version-tag {
  color: var(--muted);
  font-size: 11.5px;
}

.rubric-items-container {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.rubric-item {
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  background: var(--surface);
  border: 1px solid var(--line);
  border-left: 3.5px solid var(--line-strong);
  transition: all 180ms var(--ease);
}

.rubric-item.met {
  border-left-color: var(--status-met);
}

.rubric-item.missing,
.rubric-item.unclear {
  border-left-color: var(--status-warn);
}

.rubric-item.incorrect {
  border-left-color: var(--status-bad);
}

.item-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.item-desc {
  font-size: 13.5px;
  line-height: 1.45;
  color: var(--ink);
}

.rubric-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 700;
  line-height: 1.4;
  white-space: nowrap;
  flex-shrink: 0;
}

.status-indicator-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
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

.reason-text {
  font-size: 13px;
  line-height: 1.55;
  color: var(--ink-secondary);
  margin: 4px 0 6px;
}

.quotes-group {
  margin-top: 6px;
}

.quotes-group blockquote {
  margin: 6px 0;
  padding: 8px 10px;
  border-left: 2px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 5%, var(--surface));
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--ink-secondary);
  border-radius: 0 var(--radius-xs) var(--radius-xs) 0;
}

.quote-mark {
  color: var(--accent);
  font-weight: bold;
}

.missing-hint {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 6px;
  font-size: 12px;
  color: var(--status-warn);
  background: color-mix(in srgb, var(--status-warn) 6%, var(--surface));
  padding: 6px 8px;
  border-radius: var(--radius-xs);
}

.missing-icon {
  font-size: 12px;
}
</style>
