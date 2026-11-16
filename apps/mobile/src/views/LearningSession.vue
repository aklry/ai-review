<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useLearning, compareLearning } from '../learning';
import { address } from '../connection';
import VoiceAnswer from '../components/VoiceAnswer.vue';
import RubricFeedback from '../components/RubricFeedback.vue';
import ReferenceAnswer from '../components/ReferenceAnswer.vue';
const props = defineProps<{ id?: string }>();
const store = useLearning();
const audioBusy = ref(false);
const comparison = computed(() => (store.item ? compareLearning(store.item) : []));
const latest = computed(() => store.item?.attempts.at(-1));
const labels = { met: '已满足', missing: '未说明', incorrect: '存在错误', unclear: '需澄清' };
watch(
  () => props.id,
  () => void store.open(props.id),
  { immediate: true },
);
function onShow() {
  if (!document.hidden && !audioBusy.value) void store.refresh();
}
onMounted(() => {
  window.addEventListener('online', onShow);
  document.addEventListener('visibilitychange', onShow);
});
onBeforeUnmount(() => {
  store.leave();
  window.removeEventListener('online', onShow);
  document.removeEventListener('visibilitychange', onShow);
});
</script>
<template>
  <header>
    <router-link to="/learn">‹ 错题与收藏本</router-link
    ><button
      :disabled="store.busy || audioBusy"
      @click="store.item ? store.refresh() : store.open(props.id)"
    >
      同步
    </button>
  </header>
  <h1>{{ store.day ? '每日一练' : '单题练习' }}</h1>
  <p v-if="store.day">
    {{ store.day }} · 北京时间 ·
    {{ store.completed ? '今日已完成，可继续重答' : '练一道题，再前进一步' }}
  </p>
  <p v-if="store.error" role="alert">{{ store.error }}</p>
  <p v-if="store.notice" role="status">{{ store.notice }}</p>
  <p v-if="store.busy" class="loading-status" role="status">
    <span class="loading-spinner" aria-hidden="true"></span>正在处理，请稍候…
  </p>
  <template v-if="store.item">
    <section class="panel">
      <small
        >{{ store.item.question.difficulty.toUpperCase() }} ·
        {{
          store.item.reviewStatus === 'mastered'
            ? '已掌握'
            : store.item.reviewStatus === 'pending'
              ? '待练'
              : '尚未标记掌握'
        }}</small
      >
      <h2 class="prompt">{{ store.item.question.prompt }}</h2>
      <div class="actions">
        <button
          :disabled="store.busy || audioBusy"
          @click="store.update({ bookmarked: !store.item.bookmarked })"
        >
          {{ store.item.bookmarked ? '取消收藏' : '收藏本题' }}
        </button>
        <button
          :disabled="store.busy || audioBusy"
          @click="
            store.update({
              reviewStatus: store.item.reviewStatus === 'mastered' ? 'pending' : 'mastered',
            })
          "
        >
          {{ store.item.reviewStatus === 'mastered' ? '重新加入待练' : '标记已掌握' }}
        </button>
        <button
          v-if="store.item.reviewStatus === 'none'"
          :disabled="store.busy || audioBusy"
          @click="store.update({ reviewStatus: 'pending' })"
        >
          加入待练
        </button>
      </div>
    </section>
    <section v-if="!store.showResults" class="panel">
      <h2>{{ store.item.attempts.length ? '重新作答' : '你的回答' }}</h2>
      <p class="muted">先独立回答，提交后查看反馈和参考答案。</p>
      <VoiceAnswer
        :key="store.item.id + ':' + store.item.version"
        :clip-key="JSON.stringify([address, 'learning', store.item.id, store.item.version])"
        :language="store.item.language"
        :disabled="store.busy || store.needsSync"
        @busy="audioBusy = $event"
        @transcript="store.appendTranscript"
      />
      <label for="learning-answer">回答内容</label>
      <textarea
        id="learning-answer"
        :value="store.draft"
        rows="8"
        maxlength="20000"
        :disabled="store.busy || audioBusy"
        @input="store.edit(($event.target as HTMLTextAreaElement).value)"
      ></textarea>
      <p v-if="store.storageError" role="alert">{{ store.storageError }}</p>
      <small v-else-if="store.draft">草稿已保存在本机</small>
      <p v-if="store.draft.length > 20000" role="alert">回答超过 20,000 字，请校正后提交。</p>
      <p v-if="store.needsSync" role="alert">请先点击同步，确认上次提交结果。</p>
      <button
        class="primary"
        :disabled="
          store.busy ||
          audioBusy ||
          store.needsSync ||
          !store.draft.trim() ||
          store.draft.trim().length > 20000
        "
        @click="store.submit"
      >
        {{ store.busy ? '正在评分…' : '提交并查看反馈' }}
      </button>
      <button
        v-if="latest"
        class="quiet"
        :disabled="store.busy || audioBusy"
        @click="store.showResults = true"
      >
        查看历史反馈
      </button>
    </section>
    <template v-else-if="latest">
      <section class="panel feedback">
        <h2>最近一次 · {{ latest.cue.score }} / 5</h2>
        <p>{{ latest.cue.nextAction }}</p>
        <RubricFeedback
          v-if="latest.cue.rubricEvaluation"
          :evaluation="latest.cue.rubricEvaluation"
          :snapshot="store.item.question.rubricSnapshot"
        />
        <ReferenceAnswer v-if="latest.cue.referenceAnswer" :answer="latest.cue.referenceAnswer" />
        <button class="primary" :disabled="store.busy" @click="store.showResults = false">
          {{ store.draft ? '继续草稿' : '再答一次' }}
        </button>
      </section>
      <section class="panel">
        <h2>首次与最近的变化</h2>
        <p class="muted">只比较本题同一评分标准下的回答；重答可能受到已看反馈的影响。</p>
        <template v-if="comparison.length"
          ><article v-for="row in comparison" :key="row.id" class="change-row">
            <strong>{{ row.description }}</strong>
            <p>
              {{ row.before ? labels[row.before] : '暂无评分' }} →
              {{ row.after ? labels[row.after] : '暂无评分' }} · {{ row.change }}
            </p>
          </article></template
        >
        <p v-else>
          {{
            store.item.attempts.length < 2
              ? '再答一次后查看逐项进步。'
              : '评分版本不一致，暂不进行对比。'
          }}
        </p>
      </section>
      <section class="panel">
        <h2>作答记录 · {{ store.item.attempts.length }} 次</h2>
        <details v-for="(attempt, index) in store.item.attempts" :key="attempt.requestId">
          <summary>
            第 {{ index + 1 }} 次 · {{ attempt.cue.score }} / 5 ·
            {{ new Date(attempt.createdAt).toLocaleString('zh-CN') }}
          </summary>
          <p>{{ attempt.answerText }}</p>
          <RubricFeedback
            v-if="attempt.cue.rubricEvaluation"
            :evaluation="attempt.cue.rubricEvaluation"
            :snapshot="store.item.question.rubricSnapshot"
          />
          <VoiceAnswer
            v-if="!attempt.requestId.startsWith('import:')"
            :clip-key="
              JSON.stringify([
                address,
                'learning',
                store.item.id,
                index - (store.item.attempts[0]?.requestId.startsWith('import:') ? 1 : 0),
              ])
            "
            readonly
          />
        </details>
      </section>
    </template>
  </template>
</template>
<style scoped>
.actions button {
  flex: 1 1 130px;
}
.change-row {
  border-top: 1px solid var(--line);
  padding-top: 12px;
}
details {
  margin-block: 16px;
}
summary {
  min-height: 44px;
}
</style>
