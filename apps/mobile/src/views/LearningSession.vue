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
    <router-link to="/learn">‹ 错题与收藏本</router-link>
    <button
      class="quiet refresh-btn"
      :disabled="store.busy || audioBusy"
      @click="store.item ? store.refresh() : store.open(props.id)"
    >
      同步
    </button>
  </header>

  <!-- 每日一练 / 单题顶部 Banner -->
  <div class="learn-session-banner">
    <div class="banner-badge-row">
      <span class="banner-pill">
        <span class="ai-pulse-dot"></span>
        {{ store.day ? '每日一练 · AI 精选题' : '单题针对性强化' }}
      </span>
      <span v-if="store.day" class="day-chip">{{ store.day }}</span>
    </div>
    <h1 class="session-main-title">{{ store.day ? '今日核心考题打卡' : '单题针对复练' }}</h1>
    <p v-if="store.day" class="day-hint">
      {{
        store.completed
          ? '🎉 今日打卡已完成，可反复重答以巩固思路'
          : '每天攻克一道核心高频题，小步快跑持续进阶'
      }}
    </p>
  </div>

  <p v-if="store.error" role="alert">{{ store.error }}</p>
  <p v-if="store.notice" role="status">{{ store.notice }}</p>
  <p v-if="store.busy" class="loading-status" role="status">
    <span class="loading-spinner" aria-hidden="true"></span>
    正在与 AI 服务器同步中，请稍候…
  </p>

  <template v-if="store.item">
    <!-- 题目核心卡片 -->
    <section class="panel question-core-panel">
      <div class="q-meta-top">
        <span class="diff-badge">{{ store.item.question.difficulty.toUpperCase() }}</span>
        <span class="review-state-badge" :class="store.item.reviewStatus">
          {{
            store.item.reviewStatus === 'mastered'
              ? '✓ 已掌握'
              : store.item.reviewStatus === 'pending'
                ? '⏳ 待巩固'
                : '未标记'
          }}
        </span>
      </div>

      <div class="q-speech-box">
        <div class="speech-label">✦ 考查题目</div>
        <h2 class="prompt">{{ store.item.question.prompt }}</h2>
      </div>

      <!-- 快速状态变更条 -->
      <div class="actions quick-status-actions">
        <button
          class="status-toggle-btn"
          :class="{ active: store.item.bookmarked }"
          :disabled="store.busy || audioBusy"
          @click="store.update({ bookmarked: !store.item.bookmarked })"
        >
          {{ store.item.bookmarked ? '★ 已收藏' : '☆ 收藏本题' }}
        </button>
        <button
          class="status-toggle-btn"
          :class="{ active: store.item.reviewStatus === 'mastered' }"
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
          class="status-toggle-btn"
          :disabled="store.busy || audioBusy"
          @click="store.update({ reviewStatus: 'pending' })"
        >
          ＋ 加入待练
        </button>
      </div>
    </section>

    <!-- 作答区 -->
    <section v-if="!store.showResults" class="panel answer-panel">
      <div class="answer-head">
        <h2>{{ store.item.attempts.length ? '重新作答' : '你的回答' }}</h2>
        <span class="answer-sub-tip">先独立作答，提交后 AI 考官即刻输出逐项评分</span>
      </div>

      <VoiceAnswer
        :key="store.item.id + ':' + store.item.version"
        :clip-key="JSON.stringify([address, 'learning', store.item.id, store.item.version])"
        :language="store.item.language"
        :disabled="store.busy || store.needsSync"
        @busy="audioBusy = $event"
        @transcript="store.appendTranscript"
      />

      <label for="learning-answer">回答内容</label>
      <div class="textarea-box">
        <textarea
          id="learning-answer"
          :value="store.draft"
          rows="8"
          maxlength="20000"
          placeholder="请输入你的作答思路，或使用上方麦克风录音转写…"
          :disabled="store.busy || audioBusy"
          @input="store.edit(($event.target as HTMLTextAreaElement).value)"
        ></textarea>
        <span class="textarea-char-count">{{ store.draft.length }} / 20000</span>
      </div>

      <p v-if="store.storageError" role="alert">{{ store.storageError }}</p>
      <small v-else-if="store.draft" class="draft-tip">草稿已实时保存在本机</small>
      <p v-if="store.draft.length > 20000" role="alert">回答超过 20,000 字，请校正后提交。</p>
      <p v-if="store.needsSync" role="alert">请先点击顶部同步，确认上次提交结果。</p>

      <button
        class="primary submit-learning-btn"
        :disabled="
          store.busy ||
          audioBusy ||
          store.needsSync ||
          !store.draft.trim() ||
          store.draft.trim().length > 20000
        "
        @click="store.submit"
      >
        <span v-if="store.busy" class="loading-spinner" aria-hidden="true"></span>
        {{ store.busy ? 'AI 正在深度评分…' : '提交并查看考官反馈 ›' }}
      </button>

      <button
        v-if="latest"
        class="quiet view-history-btn"
        :disabled="store.busy || audioBusy"
        @click="store.showResults = true"
      >
        查看最近一次评分反馈 ›
      </button>
    </section>

    <!-- 反馈与对比区 -->
    <template v-else-if="latest">
      <section class="panel feedback coach-feedback-card">
        <div class="coach-score-top">
          <div class="coach-title-group">
            <span class="coach-spark">✦</span>
            <h2>最近一次考官点评</h2>
          </div>
          <div class="score-pill">
            <span class="score-val">{{ latest.cue.score }}</span>
            <span class="score-max">/ 5</span>
          </div>
        </div>
        <p class="next-action-tip">{{ latest.cue.nextAction }}</p>

        <RubricFeedback
          v-if="latest.cue.rubricEvaluation"
          :evaluation="latest.cue.rubricEvaluation"
          :snapshot="store.item.question.rubricSnapshot"
        />

        <ReferenceAnswer v-if="latest.cue.referenceAnswer" :answer="latest.cue.referenceAnswer" />

        <button
          class="primary re-answer-btn"
          :disabled="store.busy"
          @click="store.showResults = false"
        >
          {{ store.draft ? '继续当前草稿' : '针对弱点再答一次 ›' }}
        </button>
      </section>

      <!-- 变化对比 -->
      <section class="panel change-compare-panel">
        <div class="section-heading">
          <h2>首次与最近的变化对比</h2>
          <span class="compare-sub-hint">同一评分标准下的进步</span>
        </div>
        <template v-if="comparison.length">
          <div class="change-rows-list">
            <article v-for="row in comparison" :key="row.id" class="change-row">
              <strong class="change-criterion-title">{{ row.description }}</strong>
              <div class="change-status-flow">
                <span class="flow-pill before">{{
                  row.before ? labels[row.before] : '暂无评分'
                }}</span>
                <span class="flow-arrow">→</span>
                <span class="flow-pill after">{{
                  row.after ? labels[row.after] : '暂无评分'
                }}</span>
                <span
                  class="change-tag"
                  :class="{
                    positive: row.change === '新满足',
                    negative: row.change === '需重新加强',
                  }"
                >
                  {{ row.change }}
                </span>
              </div>
            </article>
          </div>
        </template>
        <p v-else class="muted no-compare-hint">
          {{
            store.item.attempts.length < 2
              ? '再答一次后即可自动生成逐项能力进步对比。'
              : '评分标准版本不一致，暂不进行跨版本对比。'
          }}
        </p>
      </section>

      <!-- 历史作答时间轴列表 -->
      <section class="panel history-attempts-panel">
        <div class="section-heading">
          <h2>作答记录 · {{ store.item.attempts.length }} 次</h2>
          <span class="compare-sub-hint">完整作答轨迹</span>
        </div>
        <div class="attempts-disclosures">
          <details
            v-for="(attempt, index) in store.item.attempts"
            :key="attempt.requestId"
            class="attempt-item-details"
          >
            <summary>
              <div class="attempt-summary-left">
                <span class="attempt-idx-chip">#{{ index + 1 }}</span>
                <strong class="attempt-score">{{ attempt.cue.score }} / 5</strong>
              </div>
              <small class="attempt-time">{{
                new Date(attempt.createdAt).toLocaleString('zh-CN')
              }}</small>
            </summary>
            <div class="attempt-detail-content">
              <p class="attempt-text">{{ attempt.answerText }}</p>
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
            </div>
          </details>
        </div>
      </section>
    </template>
  </template>
</template>

<style scoped>
.learn-session-banner {
  padding: 18px 20px;
  margin-bottom: 16px;
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px solid var(--card-border);
  box-shadow: var(--shadow-sm);
}

.banner-badge-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.banner-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  background: var(--accent-soft);
  color: var(--accent);
}

.day-chip {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.session-main-title {
  font-size: 20px;
  margin: 0 0 6px;
  font-weight: 800;
}

.day-hint {
  font-size: 13px;
  color: var(--muted);
  margin: 0;
  line-height: 1.5;
}

/* 核心题目卡片 */
.question-core-panel {
  padding: 22px;
}

.q-meta-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.diff-badge {
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  color: var(--accent);
  background: var(--accent-soft);
}

.review-state-badge {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 650;
  background: color-mix(in srgb, var(--ink) 6%, var(--surface));
  color: var(--muted);
}

.review-state-badge.mastered {
  background: var(--status-met-bg);
  color: var(--status-met);
}

.review-state-badge.pending {
  background: var(--status-warn-bg);
  color: var(--status-warn);
}

.q-speech-box {
  padding: 16px 18px;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--accent) 5%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--accent) 14%, transparent);
  margin-bottom: 16px;
}

.speech-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--accent);
  margin-bottom: 6px;
}

.q-speech-box .prompt {
  margin: 0;
  font-size: 17.5px;
  font-weight: 700;
  color: var(--ink);
  line-height: 1.5;
}

.quick-status-actions {
  margin-top: 10px;
}

.status-toggle-btn {
  font-size: 13px;
  min-height: 38px;
  padding: 6px 14px;
  border-radius: 999px;
}

.status-toggle-btn.active {
  background: var(--accent-soft);
  color: var(--accent);
  border-color: var(--accent);
  font-weight: 700;
}

/* 作答区 */
.answer-panel {
  padding: 22px;
}

.answer-head h2 {
  font-size: 18px;
  margin: 0 0 4px;
}

.answer-sub-tip {
  font-size: 12.5px;
  color: var(--muted);
  display: block;
  margin-bottom: 12px;
}

.textarea-box {
  position: relative;
  margin-top: 4px;
}

.textarea-char-count {
  position: absolute;
  right: 12px;
  bottom: 10px;
  font-size: 11.5px;
  color: var(--muted-light);
  font-variant-numeric: tabular-nums;
}

.draft-tip {
  display: block;
  font-size: 12px;
  color: var(--muted);
  margin-top: 6px;
}

.submit-learning-btn {
  margin-top: 14px;
  min-height: 50px;
  font-size: 16px;
}

.view-history-btn {
  width: 100%;
  margin-top: 8px;
  font-size: 13.5px;
}

/* 考官反馈卡片 */
.coach-feedback-card {
  padding: 22px;
  border-left: 4px solid var(--accent);
}

.coach-score-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.coach-title-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.coach-spark {
  color: var(--accent);
  font-size: 16px;
}

.coach-title-group h2 {
  font-size: 18px;
  margin: 0;
}

.score-pill {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--accent-gradient);
  color: #ffffff;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--accent) 30%, transparent);
}

.score-val {
  font-size: 16px;
  font-weight: 800;
}

.score-max {
  font-size: 12px;
  opacity: 0.8;
}

.next-action-tip {
  font-size: 14px;
  line-height: 1.55;
  color: var(--ink-secondary);
  margin-bottom: 14px;
}

.re-answer-btn {
  margin-top: 14px;
  min-height: 48px;
}

/* 变化对比 */
.change-compare-panel {
  padding: 22px;
}

.compare-sub-hint {
  font-size: 12px;
  color: var(--muted);
}

.change-rows-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 12px;
}

.change-row {
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--ink) 3%, var(--surface));
  border: 1px solid var(--line);
}

.change-criterion-title {
  font-size: 14px;
  color: var(--ink);
  display: block;
  margin-bottom: 6px;
}

.change-status-flow {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
}

.flow-pill {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 600;
}

.flow-pill.before {
  background: color-mix(in srgb, var(--ink) 6%, var(--surface));
  color: var(--muted);
}

.flow-pill.after {
  background: var(--accent-soft);
  color: var(--accent);
}

.flow-arrow {
  color: var(--muted);
}

.change-tag {
  margin-left: auto;
  font-size: 12px;
  font-weight: 700;
  color: var(--muted);
}

.change-tag.positive {
  color: var(--status-met);
}

.change-tag.negative {
  color: var(--status-bad);
}

.no-compare-hint {
  font-size: 13px;
  margin-top: 8px;
}

/* 历史作答时间轴 */
.history-attempts-panel {
  padding: 22px;
}

.attempts-disclosures {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}

.attempt-item-details {
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  padding: 10px 14px;
}

.attempt-item-details summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.attempt-summary-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.attempt-idx-chip {
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  background: var(--accent-soft);
  color: var(--accent);
}

.attempt-score {
  font-size: 14px;
  color: var(--accent);
}

.attempt-time {
  font-size: 12px;
  color: var(--muted);
}

.attempt-detail-content {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--line);
}

.attempt-text {
  font-size: 13.5px;
  line-height: 1.6;
  white-space: pre-wrap;
  margin-bottom: 12px;
}
</style>
