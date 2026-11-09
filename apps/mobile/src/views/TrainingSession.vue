<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { useSession } from '../session';
import VoiceAnswer from '../components/VoiceAnswer.vue';
import RubricFeedback from '../components/RubricFeedback.vue';
import ReferenceAnswer from '../components/ReferenceAnswer.vue';
import { address } from '../connection';
const props = defineProps<{ id: string }>();
const store = useSession();
const audioBusy = ref(false);
const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | undefined;
const timeLeft = computed(() => {
  const current = store.session;
  if (!current?.deadlineAt) return '';
  const remaining = Math.max(
    0,
    Math.ceil(
      (Date.parse(current.deadlineAt) -
        (current.pausedAt ? Date.parse(current.pausedAt) : now.value)) /
        1000,
    ),
  );
  return remaining
    ? Math.floor(remaining / 60) + '分' + (remaining % 60) + '秒'
    : '时间到，提交本题后结束';
});
const count = computed(
  () => store.session?.questions.filter((q) => !q.parentQuestionId).length ?? 0,
);
function onShow() {
  if (!document.hidden && !audioBusy.value) void store.refresh();
}
function input(event: Event) {
  store.edit((event.target as HTMLTextAreaElement).value);
}
onMounted(() => {
  void store.open(props.id);
  clock = setInterval(() => (now.value = Date.now()), 1000);
  document.addEventListener('visibilitychange', onShow);
  window.addEventListener('online', onShow);
});
onBeforeUnmount(() => {
  clearInterval(clock);
  document.removeEventListener('visibilitychange', onShow);
  window.removeEventListener('online', onShow);
  store.leave();
});
watch(
  () => props.id,
  (id) => void store.open(id),
);
</script>
<template>
  <header>
    <router-link to="/">‹ 训练</router-link>
    <button class="quiet" :disabled="store.busy || audioBusy" @click="store.refresh">
      同步进度
    </button>
  </header>
  <p v-if="store.error" role="alert">{{ store.error }}</p>
  <p v-if="store.busy" role="status">正在与服务器同步…</p>
  <template v-if="store.session">
    <h1>{{ store.session.plan.job.targetRole }}</h1>
    <section
      v-if="store.feedback && store.session.feedbackPolicy !== 'deferred'"
      class="panel feedback"
    >
      <h2>刚刚回答：{{ store.feedbackQuestion?.prompt }}</h2>
      <strong>评分 · {{ store.feedback.score }} / 5</strong>
      <p>{{ store.feedback.nextAction }}</p>
      <RubricFeedback
        v-if="store.feedback.rubricEvaluation"
        :evaluation="store.feedback.rubricEvaluation"
        :snapshot="store.feedbackQuestion?.rubricSnapshot"
      />
      <div>
        <h3>回答亮点</h3>
        <ul>
          <li v-for="(item, i) in store.feedback.strengths" :key="i">{{ item }}</li>
        </ul>
      </div>
      <div>
        <h3>待加强</h3>
        <ul>
          <li v-for="(item, i) in store.feedback.gaps" :key="i">{{ item }}</li>
        </ul>
      </div>
      <details>
        <summary>评分依据</summary>
        <blockquote v-for="(e, i) in store.feedback.evidence" :key="i">{{ e.quote }}</blockquote>
      </details>
      <ReferenceAnswer
        v-if="store.feedback.referenceAnswer"
        :answer="store.feedback.referenceAnswer"
        :track-question-id="store.feedbackQuestion?.id"
      />
    </section>
    <section v-if="store.session.status === 'completed'" class="panel">
      <h2>训练已完成</h2>
      <router-link :to="'/review/' + encodeURIComponent(id)">打开报告 ›</router-link>
    </section>
    <section v-else-if="store.session.status === 'awaiting_finish'" class="panel">
      <h2>作答已结束</h2>
      <p>已回答 {{ store.session.currentQuestionIndex }} / {{ count }} 道主问题。</p>
      <button class="primary" :disabled="store.busy || store.needsSync" @click="store.finish">
        生成报告
      </button>
    </section>
    <section v-else-if="store.question" class="panel">
      <div class="row">
        <small
          >主问题 {{ store.session.currentQuestionIndex + 1 }} / {{ count
          }}<template v-if="store.question.parentQuestionId"> · 追问</template></small
        ><small>{{ store.session.feedbackPolicy === 'deferred' ? '完整模拟' : '逐题辅导' }}</small>
      </div>
      <h2 class="prompt">{{ store.question.prompt }}</h2>
      <p v-if="timeLeft" role="status">
        {{ store.session.pausedAt ? '已暂停 · ' : '剩余时间 · ' }}{{ timeLeft }}
      </p>
      <p v-if="store.session.feedbackPolicy === 'deferred'" class="muted">
        完整模拟结束后查看评分和参考答案。
      </p>
      <button
        v-if="store.session.pausedAt"
        class="primary"
        :disabled="store.busy || store.needsSync"
        @click="store.resume"
      >
        继续已暂停的训练
      </button>
      <form v-else @submit.prevent="!audioBusy && store.submit()">
        <label for="answer">你的回答</label>
        <VoiceAnswer
          :key="JSON.stringify([address, store.session.id, store.question.id])"
          :clip-key="JSON.stringify([address, 'session', store.session.id, store.question.id])"
          :language="store.session.plan.language"
          :disabled="store.busy || !!store.session.pausedAt"
          @busy="audioBusy = $event"
          @transcript="store.appendTranscript"
        />
        <textarea
          id="answer"
          :value="store.draft"
          :disabled="store.busy || audioBusy || !!store.session.pausedAt"
          placeholder="输入回答，或录音转为文字后校正提交"
          maxlength="20000"
          rows="7"
          @input="input"
        ></textarea>
        <p v-if="store.storageError" role="alert">{{ store.storageError }}</p>
        <p v-if="store.draft.length > 20000" role="alert">回答超过 20,000 字，请校正后提交。</p>
        <small v-if="store.draft && !store.storageError" role="status">草稿已保存在本机</small>
        <button
          class="primary"
          :disabled="
            store.busy ||
            audioBusy ||
            store.needsSync ||
            !store.draft.trim() ||
            store.draft.trim().length > 20000
          "
        >
          提交回答
        </button>
      </form>
      <div
        v-if="store.session.status === 'active' && store.question"
        class="actions control-actions"
      >
        <button
          :disabled="store.busy || audioBusy"
          @click="store.control(store.session.pausedAt ? 'resume' : 'pause')"
        >
          {{ store.session.pausedAt ? '继续面试' : '暂停面试' }}
        </button>
        <button
          :disabled="store.busy || audioBusy || !!store.session.pausedAt"
          @click="store.control('skip')"
        >
          跳过本题
        </button>
      </div>
      <button
        v-if="store.session.status === 'active'"
        class="finish-button"
        :disabled="store.busy || audioBusy"
        @click="store.finish"
      >
        结束并生成报告
      </button>
    </section>
  </template>
</template>
