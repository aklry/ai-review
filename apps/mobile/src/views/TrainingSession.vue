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
const submitting = ref(false);
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
async function submit() {
  if (store.busy || audioBusy.value || submitting.value) return;
  submitting.value = true;
  try {
    await store.submit();
  } finally {
    submitting.value = false;
  }
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
  <p v-if="store.busy" class="loading-status" role="status">
    <span class="loading-spinner" aria-hidden="true"></span>
    {{ submitting ? '正在提交回答，请稍候…' : '正在与服务器同步…' }}
  </p>
  <template v-if="store.session">
    <!-- AI 面试官身份感知栏 -->
    <div class="ai-session-header">
      <div class="ai-avatar-wrapper">
        <span class="ai-avatar-ring"></span>
        <div class="ai-avatar-face">AI</div>
      </div>
      <div class="ai-header-info">
        <div class="ai-title-row">
          <h1>{{ store.session.plan.job.targetRole }}</h1>
          <span class="ai-status-badge">
            <span class="ai-pulse-dot" aria-hidden="true"></span>
            {{
              store.session.status === 'active'
                ? store.session.pausedAt
                  ? '面试暂停中'
                  : 'AI 考官在线'
                : '训练已结束'
            }}
          </span>
        </div>
        <div class="ai-meta-row">
          <span class="ai-tag">{{ store.session.plan.round }}</span>
          <span class="ai-tag">{{ store.session.plan.difficulty.toUpperCase() }}</span>
          <span class="ai-tag">{{
            store.session.feedbackPolicy === 'deferred' ? '模拟考场' : '逐题辅导'
          }}</span>
        </div>
      </div>
    </div>

    <!-- 逐题辅导：刚刚回答的即时反馈卡片 -->
    <section
      v-if="store.feedback && store.session.feedbackPolicy !== 'deferred'"
      class="panel feedback coach-card"
    >
      <div class="feedback-coach-top">
        <div class="coach-badge">
          <span class="coach-icon">✨</span>
          <span>AI 考官即时点评</span>
        </div>
        <div class="score-pill">
          <span class="score-label">综合得分</span>
          <strong class="score-value">{{ store.feedback.score }}</strong>
          <span class="score-total">/ 5</span>
        </div>
      </div>

      <h2 class="feedback-question-title">刚刚回答：{{ store.feedbackQuestion?.prompt }}</h2>
      <p class="next-action-tip">{{ store.feedback.nextAction }}</p>

      <RubricFeedback
        v-if="store.feedback.rubricEvaluation"
        :evaluation="store.feedback.rubricEvaluation"
        :snapshot="store.feedbackQuestion?.rubricSnapshot"
      />

      <div class="feedback-highlights-grid">
        <div v-if="store.feedback.strengths.length" class="highlight-box strengths">
          <h3>
            <span class="icon">✓</span>
            回答亮点
          </h3>
          <ul>
            <li v-for="(item, i) in store.feedback.strengths" :key="i">{{ item }}</li>
          </ul>
        </div>
        <div v-if="store.feedback.gaps.length" class="highlight-box gaps">
          <h3>
            <span class="icon">⚡</span>
            待加强
          </h3>
          <ul>
            <li v-for="(item, i) in store.feedback.gaps" :key="i">{{ item }}</li>
          </ul>
        </div>
      </div>

      <details v-if="store.feedback.evidence.length" class="evidence-details">
        <summary>评分依据 ({{ store.feedback.evidence.length }} 条原文采纳)</summary>
        <blockquote v-for="(e, i) in store.feedback.evidence" :key="i">{{ e.quote }}</blockquote>
      </details>

      <ReferenceAnswer
        v-if="store.feedback.referenceAnswer"
        :answer="store.feedback.referenceAnswer"
        :track-question-id="store.feedbackQuestion?.id"
      />
    </section>

    <!-- 训练完成状态 -->
    <section v-if="store.session.status === 'completed'" class="panel session-done-panel">
      <div class="done-icon-box">🏆</div>
      <h2>模拟面试已圆满完成</h2>
      <p>AI 面试官已生成深度多维能力评估与 7 天进阶复盘建议。</p>
      <router-link class="button-link primary-link" :to="'/review/' + encodeURIComponent(id)"
        >打开复盘报告 ›</router-link
      >
    </section>

    <!-- 作答结束待生成报告状态 -->
    <section
      v-else-if="store.session.status === 'awaiting_finish'"
      class="panel session-done-panel"
    >
      <div class="done-icon-box">📝</div>
      <h2>全场作答已结束</h2>
      <p>
        已回答 {{ store.session.currentQuestionIndex }} / {{ count }} 道核心问题，点击立即让 AI
        生成深度测评报告。
      </p>
      <button class="primary" :disabled="store.busy || store.needsSync" @click="store.finish">
        生成全面测评报告
      </button>
    </section>

    <!-- 当前题目与作答交互区 -->
    <section v-else-if="store.question" class="panel question-panel">
      <!-- 题目元信息与进度 -->
      <div class="question-header-row">
        <div
          class="question-index-badge"
          :class="{ 'is-followup': !!store.question.parentQuestionId }"
        >
          <span class="q-type">{{ store.question.parentQuestionId ? '深入追问' : '主考题' }}</span>
          <span class="q-num">{{ store.session.currentQuestionIndex + 1 }} / {{ count }}</span>
        </div>
        <div
          v-if="timeLeft"
          class="timer-pill"
          role="status"
          :class="{ 'is-paused': !!store.session.pausedAt }"
        >
          <span class="timer-icon">⏱</span>
          <span>{{ store.session.pausedAt ? '已暂停 · ' : '剩余时间 · ' }}{{ timeLeft }}</span>
        </div>
      </div>

      <!-- 题目内容气泡 -->
      <div class="ai-speech-bubble">
        <div class="bubble-tag">
          <span class="bubble-spark">✦</span>
          AI 面试官提问
        </div>
        <h2 class="prompt">{{ store.question.prompt }}</h2>
      </div>

      <p v-if="store.session.feedbackPolicy === 'deferred'" class="muted deferred-hint">
        ℹ️ 当前为完整模拟模式，答完所有题目后统一输出详尽复盘与评分。
      </p>

      <!-- 暂停状态唤醒按钮 -->
      <button
        v-if="store.session.pausedAt"
        class="primary"
        :disabled="store.busy || store.needsSync"
        @click="store.resume"
      >
        继续已暂停的训练
      </button>

      <!-- 作答表单 -->
      <form v-else class="answer-form" @submit.prevent="submit">
        <div class="answer-form-header">
          <label for="answer">你的回答</label>
          <span v-if="store.draft && !store.storageError" class="draft-indicator" role="status">
            <span class="draft-dot"></span>草稿已实时保存
          </span>
        </div>

        <VoiceAnswer
          :key="JSON.stringify([address, store.session.id, store.question.id])"
          :clip-key="JSON.stringify([address, 'session', store.session.id, store.question.id])"
          :language="store.session.plan.language"
          :disabled="store.busy || !!store.session.pausedAt"
          @busy="audioBusy = $event"
          @transcript="store.appendTranscript"
        />

        <div class="textarea-wrapper">
          <textarea
            id="answer"
            :value="store.draft"
            :disabled="store.busy || audioBusy || !!store.session.pausedAt"
            placeholder="输入你的作答思路，或使用上方录音自动转文字后校正…"
            maxlength="20000"
            rows="7"
            @input="input"
          ></textarea>
          <span class="char-count" :class="{ 'near-limit': store.draft.length > 18000 }">
            {{ store.draft.length }} / 20000
          </span>
        </div>

        <p v-if="store.storageError" role="alert">{{ store.storageError }}</p>
        <p v-if="store.draft.length > 20000" role="alert">回答超过 20,000 字，请校正后提交。</p>

        <button
          class="primary submit-btn"
          :aria-busy="submitting"
          :disabled="
            store.busy ||
            audioBusy ||
            store.needsSync ||
            !store.draft.trim() ||
            store.draft.trim().length > 20000
          "
        >
          <span v-if="submitting" class="loading-spinner" aria-hidden="true"></span>
          {{ submitting ? '正在提交…' : '提交回答' }}
        </button>
      </form>

      <!-- 次要控制与辅助动作 -->
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
        提前交卷并生成报告
      </button>
    </section>
  </template>
</template>

<style scoped>
/* AI 面试官头部感知区 */
.ai-session-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  margin-bottom: 16px;
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px solid var(--card-border);
  box-shadow: var(--shadow-sm);
}

.ai-avatar-wrapper {
  position: relative;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ai-avatar-ring {
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  background: var(--accent-gradient-glow);
  opacity: 0.35;
  animation: pulse-ring 2.5s infinite;
}

.ai-avatar-face {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: var(--accent-gradient);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 14px;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--accent) 35%, transparent);
}

.ai-header-info {
  flex: 1;
  min-width: 0;
}

.ai-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ai-title-row h1 {
  font-size: 18px;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ai-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--accent);
  background: var(--accent-soft);
  white-space: nowrap;
}

.ai-meta-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}

.ai-tag {
  display: inline-block;
  padding: 1px 7px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 550;
  color: var(--muted);
  background: color-mix(in srgb, var(--ink) 5%, var(--surface));
  text-transform: capitalize;
}

/* 题目卡片 */
.question-panel {
  padding: 22px;
}

.question-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}

.question-index-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 12.5px;
  font-weight: 650;
}

.question-index-badge.is-followup {
  background: var(--status-warn-bg);
  color: var(--status-warn);
}

.timer-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 600;
  background: color-mix(in srgb, var(--ink) 5%, var(--surface));
  color: var(--ink-secondary);
  font-variant-numeric: tabular-nums;
}

.timer-pill.is-paused {
  background: var(--status-warn-bg);
  color: var(--status-warn);
}

.ai-speech-bubble {
  position: relative;
  padding: 16px 18px;
  margin-bottom: 16px;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--accent) 5%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--accent) 14%, transparent);
}

.bubble-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 650;
  color: var(--accent);
  margin-bottom: 6px;
}

.bubble-spark {
  color: var(--accent-light);
}

.ai-speech-bubble .prompt {
  margin: 0;
  font-size: 18px;
  font-weight: 650;
  line-height: 1.5;
  color: var(--ink);
}

.deferred-hint {
  font-size: 13px;
  margin-bottom: 12px;
}

/* 作答区域 */
.answer-form-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.answer-form-header label {
  margin: 0 0 6px;
}

.draft-indicator {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--muted);
}

.draft-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
}

.textarea-wrapper {
  position: relative;
  margin-top: 4px;
}

.char-count {
  position: absolute;
  right: 12px;
  bottom: 10px;
  font-size: 11.5px;
  color: var(--muted-light);
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}

.char-count.near-limit {
  color: var(--danger);
  font-weight: 600;
}

.submit-btn {
  font-size: 16px;
  min-height: 50px;
}

/* 考官反馈卡片升级 */
.coach-card {
  border-left: 4px solid var(--accent);
}

.feedback-coach-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.coach-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  font-weight: 700;
  color: var(--accent);
}

.score-pill {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--accent-gradient);
  color: #ffffff;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--accent) 30%, transparent);
}

.score-label {
  font-size: 11px;
  opacity: 0.9;
}

.score-value {
  font-size: 16px;
  font-weight: 800;
}

.score-total {
  font-size: 12px;
  opacity: 0.8;
}

.feedback-question-title {
  font-size: 16px;
  margin: 6px 0 8px;
}

.next-action-tip {
  color: var(--ink-secondary);
  font-size: 14px;
  margin-bottom: 14px;
}

.feedback-highlights-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin: 14px 0;
}

@media (min-width: 480px) {
  .feedback-highlights-grid {
    grid-template-columns: 1fr 1fr;
  }
}

.highlight-box {
  padding: 12px 14px;
  border-radius: var(--radius-md);
  font-size: 13.5px;
}

.highlight-box h3 {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13.5px;
  margin: 0 0 8px;
}

.highlight-box ul {
  margin: 0;
  padding-left: 18px;
}

.highlight-box li {
  margin-bottom: 4px;
}

.highlight-box.strengths {
  background: var(--status-met-bg);
  color: var(--status-met);
  border: 1px solid color-mix(in srgb, var(--status-met) 20%, transparent);
}

.highlight-box.gaps {
  background: var(--status-warn-bg);
  color: var(--status-warn);
  border: 1px solid color-mix(in srgb, var(--status-warn) 20%, transparent);
}

.evidence-details {
  margin-top: 10px;
}

/* 完成态卡片 */
.session-done-panel {
  text-align: center;
  padding: 32px 20px;
}

.done-icon-box {
  font-size: 40px;
  margin-bottom: 12px;
}

.session-done-panel h2 {
  font-size: 22px;
  margin-bottom: 8px;
}

.session-done-panel p {
  color: var(--muted);
  max-width: 360px;
  margin: 0 auto 20px;
}
</style>
