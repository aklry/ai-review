<script setup lang="ts">
import type { ReferenceAnswer } from '@interview-assistant/contracts';
import { ref } from 'vue';
import { request } from '../lib/http.js';
const props = defineProps<{ answer: ReferenceAnswer; trackQuestionId?: string | undefined }>();
const recorded = ref(''),
  notice = ref('');
async function opened(event: Event) {
  const id = props.trackQuestionId;
  if (!id || !(event.target as HTMLDetailsElement).open || recorded.value === id) return;
  try {
    await request({
      method: 'POST',
      url: '/questions/' + encodeURIComponent(id) + '/reference-view',
    });
    recorded.value = id;
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
  margin-top: 20px;
  padding: 16px;
  border: 1px solid #dbeafe;
  border-radius: 12px;
  background: #f8faff;
  overflow-wrap: anywhere;
  line-height: 1.8;
}
.reference-answer h3 {
  margin: 0 0 8px;
}
.reference-hint {
  color: #64748b;
  font-size: 13px;
}
.reference-content {
  white-space: pre-wrap;
}
.reference-answer ul {
  padding-left: 20px;
}
</style>
