<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { SessionReview } from '@interview-assistant/contracts';
import { api, message } from '../connection';
const props = defineProps<{ id: string }>();
const data = ref<SessionReview>();
const error = ref('');
async function load() {
  error.value = '';
  try {
    data.value = await api.getSessionReview(props.id);
  } catch (e) {
    error.value = message(e);
  }
}
onMounted(load);
</script>
<template>
  <router-link to="/records">‹ 训练记录</router-link>
  <h1>{{ data?.targetRole ?? '训练复盘' }}</h1>
  <div v-if="error">
    <p role="alert">{{ error }}</p>
    <button @click="load">重试</button>
  </div>
  <p v-else-if="!data" role="status">正在读取报告…</p>
  <template v-else-if="data.status === 'completed'">
    <section v-if="data.report" class="panel feedback">
      <h2>单场报告</h2>
      <p>{{ data.report.summary }}</p>
      <strong>综合评分 · {{ data.report.overallScore ?? '未测评' }}</strong>
    </section>
    <h2>逐题复盘</h2>
    <details v-for="(q, i) in data.questions" :key="q.id" class="panel">
      <summary>{{ q.parentQuestionId ? '追问' : '题目' }} · {{ q.prompt }}</summary>
      <p>{{ q.answer?.answerText || (q.skippedAt ? '已跳过' : '未回答') }}</p>
      <template v-if="q.answer?.cue">
        <h3>改进建议</h3>
        <p>{{ q.answer.cue.nextAction }}</p>
        <blockquote v-for="(item, n) in q.answer.cue.evidence" :key="i + '-' + n">
          {{ item.quote }}
        </blockquote>
        <template v-if="q.answer.cue.referenceAnswer"
          ><h3>参考答案</h3>
          <p>{{ q.answer.cue.referenceAnswer.content }}</p></template
        >
      </template>
    </details>
  </template>
  <router-link v-else :to="'/training/' + encodeURIComponent(id)">继续这场训练 ›</router-link>
</template>
