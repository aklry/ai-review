<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount } from 'vue';
import { useSession } from '../session';
const props = defineProps<{ id: string }>();
const store = useSession();
const count = computed(
  () => store.session?.questions.filter((q) => !q.parentQuestionId).length ?? 0,
);
function onShow() {
  if (!document.hidden) void store.refresh();
}
function input(event: Event) {
  store.edit((event.target as HTMLTextAreaElement).value);
}
onMounted(() => {
  void store.open(props.id);
  document.addEventListener('visibilitychange', onShow);
  window.addEventListener('online', onShow);
});
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onShow);
  window.removeEventListener('online', onShow);
  store.leave();
});
</script>
<template>
  <header>
    <router-link to="/">‹ 训练</router-link
    ><button class="quiet" :disabled="store.busy" @click="store.refresh">同步进度</button>
  </header>
  <p v-if="store.error" role="alert">{{ store.error }}</p>
  <p v-if="store.busy" role="status">正在与服务器同步…</p>
  <template v-if="store.session">
    <h1>{{ store.session.plan.job.targetRole }}</h1>
    <section v-if="store.feedback" class="panel feedback">
      <h2>上一题反馈 · {{ store.feedback.score }} / 5</h2>
      <p>{{ store.feedback.nextAction }}</p>
      <details>
        <summary>评分依据</summary>
        <p v-for="(e, i) in store.feedback.evidence" :key="i">{{ e.quote }}</p>
      </details>
    </section>
    <section v-if="store.session.status === 'completed'" class="panel">
      <h2>训练已完成</h2>
      <router-link :to="'/review/' + encodeURIComponent(id)">打开报告 ›</router-link>
    </section>
    <section v-else-if="store.session.status === 'awaiting_finish'" class="panel">
      <h2>作答已结束</h2>
      <p>生成报告后可以逐题复盘。</p>
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
      <button
        v-if="store.session.pausedAt"
        class="primary"
        :disabled="store.busy || store.needsSync"
        @click="store.resume"
      >
        继续已暂停的训练
      </button>
      <form v-else @submit.prevent="store.submit">
        <label for="answer">你的回答</label>
        <textarea
          id="answer"
          :value="store.draft"
          :disabled="store.busy"
          placeholder="输入回答，或用手机输入法听写"
          rows="7"
          @input="input"
        ></textarea>
        <p v-if="store.storageError" role="alert">{{ store.storageError }}</p>
        <small v-else-if="store.draft" role="status">草稿已保存在本机</small>
        <button class="primary" :disabled="store.busy || store.needsSync || !store.draft.trim()">
          提交回答
        </button>
      </form>
    </section>
  </template>
</template>
