<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  practiceTaskSchema,
  type PracticeTaskView,
  type CoachingCue,
} from '@interview-assistant/contracts';
import { request } from '../lib/http.js';
import ReferenceAnswer from '../components/ReferenceAnswer.vue';
import RubricFeedback from '../components/RubricFeedback.vue';
const props = defineProps<{ sessionId: string; questionId: string; criterionId: string }>();
const task = ref<PracticeTaskView | null>(null),
  answer = ref(''),
  busy = ref(false),
  error = ref('');
const labels = ['原题重答', '案例练习', '变式复测'];
const statuses = { met: '已满足', missing: '未说明', incorrect: '存在错误', unclear: '需要澄清' };
function statusFor(cue: CoachingCue, id: string) {
  const item = cue.rubricEvaluation?.items.find((i) => i.criterionId === id);
  return item ? statuses[item.status] : '暂无评分';
}
const focus = computed(
  () => task.value?.snapshot.criteria.find((c) => c.id === task.value?.criterionId)?.description,
);
let generation = 0;
async function load() {
  const n = ++generation;
  task.value = null;
  busy.value = true;
  error.value = '';
  answer.value = '';
  try {
    const data = await request({
      method: 'POST',
      url: '/questions/' + encodeURIComponent(props.questionId) + '/practice',
      data: { criterionId: props.criterionId },
    });
    if (n === generation) task.value = practiceTaskSchema.parse(data);
  } catch (e) {
    if (n === generation) error.value = e instanceof Error ? e.message : '加载失败';
  } finally {
    if (n === generation) busy.value = false;
  }
}
watch(() => [props.questionId, props.criterionId], load, { immediate: true });
async function submit() {
  const current = task.value,
    n = generation;
  if (!current || busy.value || !answer.value.trim()) return;
  busy.value = true;
  error.value = '';
  try {
    const data = await request({
      method: 'POST',
      url: '/practice/' + current.id + '/answers',
      data: { stage: current.stage, answerText: answer.value },
      timeout: 300000,
    });
    if (n === generation) {
      task.value = practiceTaskSchema.parse(data);
      answer.value = '';
    }
  } catch (e) {
    if (n === generation) error.value = e instanceof Error ? e.message : '提交失败';
  } finally {
    if (n === generation) busy.value = false;
  }
}
const results = computed(() =>
  task.value
    ? [task.value.original, ...task.value.attempts].map((attempt, i) => ({
        ...attempt,
        label: ['首次回答', ...labels][i],
        focus: attempt.cue.rubricEvaluation?.items.find(
          (it) => it.criterionId === task.value?.criterionId,
        ),
      }))
    : [],
);
</script>
<template>
  <section class="view history-view">
    <header class="view-header">
      <div>
        <p class="eyebrow">专项练习</p>
        <h1>{{ focus ?? '加载练习' }}</h1>
      </div>
      <RouterLink :to="'/history/' + sessionId">返回复盘</RouterLink>
    </header>
    <p v-if="error" role="alert">
      {{ error }} <button :disabled="busy" @click="load">重新载入</button>
    </p>
    <template v-if="task"
      ><article v-if="task.prompt" class="history-card">
        <h2>{{ labels[task.stage] }} · {{ task.stage + 1 }} / 3</h2>
        <p v-if="task.stage === 2">
          {{
            task.freshRetest ? '独立作答后查看本题反馈。' : '此场景曾分配过，本次按重复练习记录。'
          }}
        </p>
        <p>{{ task.prompt }}</p>
        <el-input
          v-model="answer"
          type="textarea"
          :rows="7"
          maxlength="20000"
          aria-label="练习回答"
          :disabled="busy"
        />
        <el-button type="primary" :disabled="busy || !answer.trim()" :loading="busy" @click="submit"
          >提交回答</el-button
        >
      </article>
      <h2>{{ task.stage === 3 ? '练习结果' : '已有回答与反馈' }}</h2>
      <p v-if="task.stage === 3">
        {{ task.freshRetest ? '最后一次为新场景独立复测。' : '最后一次为已分配场景的复习。' }}
      </p>
      <div v-if="task.attempts.length" class="comparison">
        <table>
          <caption>
            各次作答的评分项对比
          </caption>
          <thead>
            <tr>
              <th scope="col">评分项</th>
              <th v-for="r in results" :key="r.label" scope="col">{{ r.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="criterion in task.snapshot.criteria" :key="criterion.id">
              <th scope="row">{{ criterion.description }}</th>
              <td v-for="r in results" :key="r.label">{{ statusFor(r.cue, criterion.id) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-for="(attempt, index) in results" :key="index" class="history-card">
        <h3>{{ attempt.label }} · {{ attempt.cue.score }} / 5</h3>
        <p v-if="attempt.focus">
          {{ statuses[attempt.focus.status] }} · {{ attempt.focus.reason }}
        </p>
        <blockquote v-for="quote in attempt.focus?.quotes" :key="quote">{{ quote }}</blockquote>
        <details>
          <summary>查看题目、回答与详细反馈</summary>
          <p>{{ attempt.prompt }}</p>
          <p class="review-answer">{{ attempt.answerText }}</p>
          <RubricFeedback
            v-if="attempt.cue.rubricEvaluation"
            :snapshot="task.snapshot"
            :evaluation="attempt.cue.rubricEvaluation"
          /><ReferenceAnswer
            v-if="attempt.cue.referenceAnswer"
            :answer="attempt.cue.referenceAnswer"
          />
        </details>
      </div>
    </template>
  </section>
</template>

<style scoped>
.comparison {
  overflow-x: auto;
}
.comparison table {
  width: 100%;
  border-collapse: collapse;
  background: white;
}
.comparison caption {
  text-align: left;
  font-weight: 600;
  padding: 0.8rem 0;
}
.comparison th,
.comparison td {
  text-align: left;
  padding: 0.65rem 0.85rem;
  border-bottom: 1px solid #e2e8f0;
}
.comparison td {
  white-space: nowrap;
}
</style>
