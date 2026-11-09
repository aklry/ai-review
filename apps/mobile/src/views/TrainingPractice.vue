<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { CoachingCue, InterviewLanguage } from '@interview-assistant/contracts';
import { address } from '../connection';
import { usePractice } from '../practice';
import RubricFeedback from '../components/RubricFeedback.vue';
import ReferenceAnswer from '../components/ReferenceAnswer.vue';
import VoiceAnswer from '../components/VoiceAnswer.vue';

const props = defineProps<{
  sessionId: string;
  questionId: string;
  criterionId: string;
  language?: InterviewLanguage;
}>();
const practice = usePractice();
const task = computed(() => practice.task);
const audioBusy = ref(false);
const stages = ['原题重答', '案例练习', '变式复测'];
const labels = { met: '已满足', missing: '未说明', incorrect: '存在错误', unclear: '需要澄清' };
const focus = computed(() =>
  task.value?.snapshot.criteria.find((criterion) => criterion.id === task.value?.criterionId),
);
const results = computed(() => (task.value ? [task.value.original, ...task.value.attempts] : []));
function statusFor(cue: CoachingCue, criterionId: string) {
  const item = cue.rubricEvaluation?.items.find(
    (candidate) => candidate.criterionId === criterionId,
  );
  return item ? labels[item.status] : '暂无评分';
}
watch(
  () => [props.questionId, props.criterionId],
  () => void practice.open(props.questionId, props.criterionId),
  { immediate: true },
);
onBeforeUnmount(() => practice.leave());
</script>

<template>
  <header>
    <router-link :to="'/review/' + encodeURIComponent(sessionId)">‹ 返回复盘</router-link>
    <button class="quiet" :disabled="practice.busy || audioBusy" @click="practice.refresh">
      同步进度
    </button>
  </header>
  <p v-if="practice.error" role="alert">{{ practice.error }}</p>
  <p v-if="practice.storageError" role="alert">{{ practice.storageError }}</p>
  <p v-if="practice.busy" role="status">正在同步专项练习…</p>
  <template v-if="task">
    <small>专项练习 · {{ task.sourceQuestionId }}</small>
    <h1>{{ focus?.description ?? '针对评分项练习' }}</h1>
    <p v-if="task.stage >= 2">
      {{ task.freshRetest ? '本次变式复测使用新的练习场景。' : '此练习场景已在本场使用。' }}
    </p>
    <section v-if="task.stage < 3 && task.prompt" class="panel">
      <small>{{ stages[task.stage] }} · {{ task.stage + 1 }} / 3</small>
      <h2 class="prompt">{{ task.prompt }}</h2>
      <label for="practice-answer">你的回答</label>
      <VoiceAnswer
        :key="JSON.stringify([address, 'practice', task.id, task.stage])"
        :clip-key="JSON.stringify([address, 'practice', task.id, task.stage])"
        :language="props.language ?? 'zh-CN'"
        :disabled="practice.busy || practice.needsSync"
        @busy="audioBusy = $event"
        @transcript="practice.appendTranscript"
      />
      <textarea
        id="practice-answer"
        :value="practice.draft"
        rows="7"
        maxlength="20000"
        :disabled="practice.busy || audioBusy"
        @input="practice.edit(($event.target as HTMLTextAreaElement).value)"
      ></textarea>
      <p v-if="practice.draft.length > 20000" role="alert">回答超过 20,000 字，请校正后提交。</p>
      <button
        class="primary"
        :disabled="
          practice.busy ||
          practice.needsSync ||
          audioBusy ||
          !practice.draft.trim() ||
          practice.draft.trim().length > 20000
        "
        @click="practice.submit"
      >
        提交回答
      </button>
    </section>
    <section v-else class="panel feedback">
      <h2>练习完成</h2>
      <p>已完成原题重答、案例练习和变式复测。</p>
    </section>

    <template v-if="results.length">
      <h2>评分项对比</h2>
      <div class="comparison">
        <table>
          <caption>
            各次作答的评分项状态
          </caption>
          <thead>
            <tr>
              <th scope="col">评分项</th>
              <th v-for="(result, index) in results" :key="index" scope="col">
                {{ index === 0 ? '首次回答' : stages[index - 1] }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="criterion in task.snapshot.criteria" :key="criterion.id">
              <th scope="row">{{ criterion.description }}</th>
              <td v-for="(result, index) in results" :key="index">
                {{ statusFor(result.cue, criterion.id) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <article v-for="(result, index) in results" :key="index" class="panel practice-result">
        <h3>{{ index === 0 ? '首次回答' : stages[index - 1] }} · {{ result.cue.score }} / 5</h3>
        <p>{{ result.cue.nextAction }}</p>
        <RubricFeedback
          v-if="result.cue.rubricEvaluation"
          :evaluation="result.cue.rubricEvaluation"
          :snapshot="task.snapshot"
        />
        <details>
          <summary>查看题目与回答</summary>
          <p>{{ result.prompt }}</p>
          <p class="review-answer">{{ result.answerText }}</p>
          <VoiceAnswer
            :clip-key="
              index === 0
                ? JSON.stringify([address, 'session', sessionId, questionId])
                : JSON.stringify([address, 'practice', task.id, index - 1])
            "
            :language="props.language ?? 'zh-CN'"
            readonly
          />
          <ReferenceAnswer v-if="result.cue.referenceAnswer" :answer="result.cue.referenceAnswer" />
        </details>
      </article>
    </template>
  </template>
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
  padding: 10px 0;
}
.comparison th,
.comparison td {
  text-align: left;
  padding: 10px;
  border-bottom: 1px solid var(--line);
}
.comparison td {
  white-space: nowrap;
}
.practice-result {
  border-top: 1px solid var(--line);
}
.review-answer {
  white-space: pre-wrap;
}
</style>
