<script setup lang="ts">
import { ref } from 'vue';
import type { ReferenceAnswer as Answer } from '@interview-assistant/contracts';
import { api } from '../connection';

const props = defineProps<{ answer: Answer; trackQuestionId?: string | undefined }>();
const notice = ref('');
let recorded = '';
async function opened(event: Event) {
  const questionId = props.trackQuestionId;
  if (!questionId || !(event.currentTarget as HTMLDetailsElement).open || recorded === questionId)
    return;
  try {
    await api.markReferenceViewed(questionId);
    recorded = questionId;
    notice.value = '';
  } catch {
    notice.value = '查看记录保存失败，重新展开可重试。';
  }
}
</script>

<template>
  <component
    :is="trackQuestionId ? 'details' : 'section'"
    class="reference-answer"
    aria-label="本题参考答案"
    @toggle="opened"
  >
    <summary v-if="trackQuestionId">
      <span class="ref-summary-title">💡 查看本题参考答案</span>
      <span class="ref-kind-badge">{{
        answer.kind === 'experience-template' ? '经历模板' : '示范思路'
      }}</span>
    </summary>
    <div v-else class="ref-header">
      <h3>本题参考答案</h3>
      <span class="ref-kind-badge">{{
        answer.kind === 'experience-template' ? '经历模板' : '示范思路'
      }}</span>
    </div>

    <p v-if="notice" class="notice-tip" role="status">{{ notice }}</p>

    <div class="reference-inner-box">
      <p class="reference-hint">
        {{
          answer.kind === 'experience-template'
            ? '经历回答模板 · 请用你的真实项目经历与数据补充占位内容。'
            : '示范解法 · 呈现高分答题框架与技术要点，也可采用其他合理解法。'
        }}
      </p>

      <div class="reference-content-card">
        <p class="reference-content">{{ answer.content }}</p>
      </div>

      <div class="key-points-section">
        <strong>✦ 答题核心要点</strong>
        <ul class="points-list">
          <li v-for="(point, index) in answer.keyPoints" :key="index">{{ point }}</li>
        </ul>
      </div>

      <template v-if="answer.missingFacts.length">
        <div class="missing-facts-section">
          <strong>⚡ 需要你补充的真实事实</strong>
          <ul class="missing-list">
            <li v-for="(fact, index) in answer.missingFacts" :key="index">{{ fact }}</li>
          </ul>
        </div>
      </template>
    </div>
  </component>
</template>

<style scoped>
.reference-answer {
  display: block;
  margin-top: 14px;
  padding: 16px;
  border: 1px solid var(--reference-line);
  border-radius: var(--radius-md);
  background: var(--reference-bg);
  overflow-wrap: anywhere;
  line-height: 1.6;
}

.reference-answer summary {
  min-height: 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  cursor: pointer;
}

.ref-summary-title {
  font-weight: 700;
  color: var(--accent);
  font-size: 14px;
}

.ref-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.ref-header h3 {
  font-size: 15px;
  margin: 0;
  color: var(--accent);
}

.ref-kind-badge {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 650;
  background: var(--accent-soft);
  color: var(--accent);
}

.notice-tip {
  color: var(--status-warn);
  font-size: 12px;
  margin: 6px 0;
}

.reference-inner-box {
  margin-top: 10px;
}

.reference-hint {
  color: var(--muted);
  font-size: 12.5px;
  margin-bottom: 10px;
  line-height: 1.5;
}

.reference-content-card {
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  background: var(--surface);
  border: 1px solid var(--card-border);
  margin-bottom: 12px;
}

.reference-content {
  white-space: pre-wrap;
  font-size: 13.5px;
  line-height: 1.65;
  margin: 0;
  color: var(--ink);
}

.key-points-section,
.missing-facts-section {
  margin-top: 10px;
}

.key-points-section strong {
  font-size: 13px;
  color: var(--accent);
  display: block;
  margin-bottom: 6px;
}

.missing-facts-section strong {
  font-size: 13px;
  color: var(--status-warn);
  display: block;
  margin-bottom: 6px;
}

.points-list,
.missing-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
}

.points-list li,
.missing-list li {
  margin-bottom: 4px;
  line-height: 1.5;
}
</style>
