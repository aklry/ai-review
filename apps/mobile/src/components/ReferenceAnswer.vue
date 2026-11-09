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
    <summary v-if="trackQuestionId">查看本题参考答案</summary>
    <h3 v-else>本题参考答案</h3>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p class="reference-hint">
      {{
        answer.kind === 'experience-template'
          ? '经历回答模板 · 请用你的真实经历补充占位内容。'
          : '示范解法 · 用于理解答题思路，也可以采用其他有效方案。'
      }}
    </p>
    <p class="reference-content">{{ answer.content }}</p>
    <strong>答题要点</strong>
    <ul>
      <li v-for="(point, index) in answer.keyPoints" :key="index">{{ point }}</li>
    </ul>
    <template v-if="answer.missingFacts.length">
      <strong>需要你补充的事实</strong>
      <ul>
        <li v-for="(fact, index) in answer.missingFacts" :key="index">{{ fact }}</li>
      </ul>
    </template>
  </component>
</template>

<style scoped>
.reference-answer {
  display: block;
  margin-top: 14px;
  padding: 14px;
  border: 1px solid #b9d7cd;
  border-radius: 6px;
  background: #f3f8f4;
  overflow-wrap: anywhere;
  line-height: 1.75;
}
.reference-answer summary {
  min-height: 32px;
}
.reference-hint {
  color: var(--muted);
  font-size: 13px;
}
.reference-content {
  white-space: pre-wrap;
}
.reference-answer ul {
  padding-left: 20px;
}
</style>
