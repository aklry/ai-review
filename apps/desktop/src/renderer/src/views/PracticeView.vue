<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue';
import { storeToRefs } from 'pinia';
import type { CoachingCue } from '@interview-assistant/contracts';
import ReferenceAnswer from '../components/ReferenceAnswer.vue';
import RubricFeedback from '../components/RubricFeedback.vue';
import { usePracticeStore } from '../stores/practice.js';

const props = defineProps<{ sessionId: string; questionId: string; criterionId: string }>();
const practice = usePracticeStore();
const { task, answer, busy, needsSync, error, storageError, earlierDrafts } = storeToRefs(practice);
const labels = ['原题重答', '案例练习', '变式复测'];
const statuses = { met: '已满足', missing: '未说明', incorrect: '存在错误', unclear: '需要澄清' };
function statusFor(cue: CoachingCue, id: string) {
  const item = cue.rubricEvaluation?.items.find((i) => i.criterionId === id);
  return item ? statuses[item.status] : '暂无评分';
}
const focus = computed(
  () => task.value?.snapshot.criteria.find((c) => c.id === task.value?.criterionId)?.description,
);
watch(
  () => [props.questionId, props.criterionId] as const,
  ([questionId, criterionId]) => void practice.open(questionId, criterionId),
  { immediate: true },
);
onBeforeUnmount(practice.leave);
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
  <section class="view history-view" :aria-busy="busy">
    <header class="view-header">
      <div>
        <p class="eyebrow">专项练习</p>
        <h1>{{ focus ?? '加载练习' }}</h1>
      </div>
      <RouterLink :to="'/history/' + sessionId">返回复盘</RouterLink>
    </header>
    <p v-if="error" role="alert">
      {{ error }}
      <el-button v-if="needsSync" :disabled="busy" @click="practice.sync">
        {{ task ? '同步练习进度' : '重新载入' }}
      </el-button>
    </p>
    <p v-if="storageError" role="status">{{ storageError }}</p>
    <details v-for="draft in earlierDrafts" :key="draft.stage" class="history-card">
      <summary>{{ labels[draft.stage] }}的本机草稿（未提交）</summary>
      <p class="review-answer">{{ draft.text }}</p>
    </details>
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
          :model-value="answer"
          type="textarea"
          :rows="7"
          maxlength="20000"
          aria-label="练习回答"
          :disabled="busy"
          @update:model-value="practice.edit"
        />
        <el-button
          type="primary"
          :disabled="busy || needsSync || !answer.trim()"
          :loading="busy"
          @click="practice.submit"
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
