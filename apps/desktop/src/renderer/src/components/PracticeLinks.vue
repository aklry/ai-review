<script setup lang="ts">
import { computed, ref, onMounted, watch, onBeforeUnmount } from 'vue';
import { getSessionReview } from '../api/interview.js';
import type { SessionReview } from '@interview-assistant/contracts';
const props = defineProps<{ sessionId: string; review?: SessionReview }>();
const loaded = ref<SessionReview | null>(null),
  error = ref('');
let version = 0;
async function load() {
  const n = ++version;
  loaded.value = null;
  error.value = '';
  if (props.review) return;
  try {
    const result = await getSessionReview(props.sessionId);
    if (version === n) loaded.value = result;
  } catch {
    if (version === n) error.value = '专项练习暂时无法载入';
  }
}
onMounted(load);
watch(() => props.sessionId, load);
onBeforeUnmount(() => {
  version++;
});
const current = computed(() => props.review ?? loaded.value);
const gaps = computed(
  () =>
    current.value?.questions.flatMap(
      (q) =>
        q.answer?.cue?.rubricEvaluation?.items
          .filter((i) => i.status !== 'met')
          .map((i) => ({
            question: q.id,
            criterion: i.criterionId,
            label:
              q.rubricSnapshot?.criteria.find((c) => c.id === i.criterionId)?.description ??
              i.criterionId,
          })) ?? [],
    ) ?? [],
);
</script>
<template>
  <section v-if="current?.status === 'completed' && gaps.length" class="history-card">
    <h3>练习薄弱项</h3>
    <ul>
      <li v-for="gap in gaps" :key="gap.question + gap.criterion">
        <RouterLink
          :to="{
            name: 'practice',
            params: { sessionId: sessionId, questionId: gap.question, criterionId: gap.criterion },
          }"
          >{{ gap.label }} · 开始或继续练习</RouterLink
        >
      </li>
    </ul>
  </section>
  <p v-else-if="error" role="alert">{{ error }} <button @click="load">重试</button></p>
</template>
