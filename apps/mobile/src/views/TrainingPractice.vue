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
const submitting = ref(false);
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
async function submit() {
  if (practice.busy || audioBusy.value || submitting.value) return;
  submitting.value = true;
  try {
    await practice.submit();
  } finally {
    submitting.value = false;
  }
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
  <p v-if="practice.busy" class="loading-status" role="status">
    <span class="loading-spinner" aria-hidden="true"></span>
    {{ submitting ? '正在提交回答，请稍候…' : '正在同步专项练习…' }}
  </p>

  <template v-if="task">
    <!-- 针对性练习头卡片 -->
    <div class="practice-hero-header">
      <div class="focus-pill">
        <span class="focus-icon">🎯</span>
        <span>专项针对训练</span>
      </div>
      <h1 class="focus-title">{{ focus?.description ?? '针对评分项专项巩固' }}</h1>
      <p v-if="task.stage >= 2" class="fresh-retest-note">
        {{ task.freshRetest ? '✦ 本次变式复测已启用全新业务场景题。' : '此练习场景已在本场使用。' }}
      </p>

      <!-- 3阶段进度条 -->
      <div class="stages-indicator">
        <div
          v-for="(stg, i) in stages"
          :key="stg"
          class="stage-step"
          :class="{ active: task.stage === i, done: task.stage > i }"
        >
          <div class="step-circle">{{ task.stage > i ? '✓' : i + 1 }}</div>
          <span class="step-text">{{ stg }}</span>
        </div>
      </div>
    </div>

    <!-- 当前阶段作答卡片 -->
    <section v-if="task.stage < 3 && task.prompt" class="panel practice-prompt-panel">
      <div class="stage-tag-row">
        <span class="stage-chip">{{ stages[task.stage] }}</span>
        <span class="stage-count">阶段 {{ task.stage + 1 }} / 3</span>
      </div>

      <div class="prompt-speech-box">
        <div class="ai-speech-label">
          <span class="ai-pulse-dot"></span>
          AI 专项考题
        </div>
        <h2 class="prompt">{{ task.prompt }}</h2>
      </div>

      <div class="practice-form-area">
        <label for="practice-answer">你的回答思路</label>
        <VoiceAnswer
          :key="JSON.stringify([address, 'practice', task.id, task.stage])"
          :clip-key="JSON.stringify([address, 'practice', task.id, task.stage])"
          :language="props.language ?? 'zh-CN'"
          :disabled="practice.busy || practice.needsSync"
          @busy="audioBusy = $event"
          @transcript="practice.appendTranscript"
        />

        <div class="practice-textarea-box">
          <textarea
            id="practice-answer"
            :value="practice.draft"
            rows="7"
            maxlength="20000"
            placeholder="针对本次考查要点展开作答，重点阐明核心决策与量化收益…"
            :disabled="practice.busy || audioBusy"
            @input="practice.edit(($event.target as HTMLTextAreaElement).value)"
          ></textarea>
          <span class="practice-char-count">{{ practice.draft.length }} / 20000</span>
        </div>

        <p v-if="practice.draft.length > 20000" role="alert">回答超过 20,000 字，请校正后提交。</p>
        <button
          class="primary submit-practice-btn"
          :aria-busy="submitting"
          :disabled="
            practice.busy ||
            practice.needsSync ||
            audioBusy ||
            !practice.draft.trim() ||
            practice.draft.trim().length > 20000
          "
          @click="submit"
        >
          <span v-if="submitting" class="loading-spinner" aria-hidden="true"></span>
          {{ submitting ? '正在提交…' : '提交回答' }}
        </button>
      </div>
    </section>

    <!-- 练习完成祝贺卡 -->
    <section v-else class="panel feedback practice-complete-card">
      <div class="complete-icon">🎉</div>
      <h2>专项强化练习圆满完成</h2>
      <p>你已顺利完成原题重答、案例练习和变式复测，相关评分项理解已显著加深。</p>
    </section>

    <!-- 阶段演变评分对比表 -->
    <template v-if="results.length">
      <div class="section-heading comparison-heading">
        <h2>评分项演化对比</h2>
        <span class="sub-hint">历次作答状态变化</span>
      </div>

      <div class="comparison modern-comparison">
        <table>
          <caption>
            各次作答的评分项状态
          </caption>
          <thead>
            <tr>
              <th scope="col">评分考查项</th>
              <th v-for="(result, index) in results" :key="index" scope="col">
                {{ index === 0 ? '首次回答' : stages[index - 1] }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="criterion in task.snapshot.criteria" :key="criterion.id">
              <th scope="row">{{ criterion.description }}</th>
              <td v-for="(result, index) in results" :key="index">
                <span class="status-cell-tag" :class="statusFor(result.cue, criterion.id)">
                  {{ statusFor(result.cue, criterion.id) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="section-heading history-heading">
        <h2>作答与反馈详情</h2>
        <span class="sub-hint">回顾各阶段作答</span>
      </div>

      <article v-for="(result, index) in results" :key="index" class="panel practice-result-card">
        <div class="section-heading result-head">
          <div class="result-title-group">
            <span class="result-stage-tag">{{ index === 0 ? '首次回答' : stages[index - 1] }}</span>
            <strong class="result-score"
              >{{ result.cue.score }} <span class="denom">/ 5</span></strong
            >
          </div>
        </div>
        <p class="result-next-action">{{ result.cue.nextAction }}</p>

        <RubricFeedback
          v-if="result.cue.rubricEvaluation"
          :evaluation="result.cue.rubricEvaluation"
          :snapshot="task.snapshot"
        />

        <details class="detail-disclosure">
          <summary>查看题目与作答详情</summary>
          <div class="detail-prompt-box">
            <strong>题目：</strong>
            <p>{{ result.prompt }}</p>
          </div>
          <div class="detail-answer-box">
            <strong>作答：</strong>
            <p class="review-answer">{{ result.answerText }}</p>
          </div>
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
.practice-hero-header {
  padding: 18px 20px;
  margin-bottom: 16px;
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px solid var(--card-border);
  box-shadow: var(--shadow-sm);
}

.focus-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 650;
  background: var(--accent-soft);
  color: var(--accent);
  margin-bottom: 8px;
}

.focus-title {
  font-size: 20px;
  margin: 0 0 6px;
  font-weight: 800;
}

.fresh-retest-note {
  font-size: 12.5px;
  color: var(--accent);
  margin: 0 0 12px;
}

/* 阶段指示条 */
.stages-indicator {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}

.stage-step {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  opacity: 0.45;
  transition: all 180ms var(--ease);
}

.stage-step.active {
  opacity: 1;
}

.stage-step.done {
  opacity: 0.85;
}

.step-circle {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--ink) 12%, var(--surface));
  color: var(--ink);
  font-size: 11px;
  font-weight: 750;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stage-step.active .step-circle {
  background: var(--accent-gradient);
  color: #ffffff;
  box-shadow: 0 2px 6px color-mix(in srgb, var(--accent) 30%, transparent);
}

.stage-step.done .step-circle {
  background: var(--status-met);
  color: #ffffff;
}

.step-text {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--ink-secondary);
}

/* 题目面板 */
.practice-prompt-panel {
  padding: 22px;
}

.stage-tag-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.stage-chip {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  background: var(--accent-soft);
  color: var(--accent);
}

.stage-count {
  font-size: 12px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

.prompt-speech-box {
  padding: 16px 18px;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--accent) 5%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--accent) 14%, transparent);
  margin-bottom: 16px;
}

.ai-speech-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 650;
  color: var(--accent);
  margin-bottom: 6px;
}

.prompt-speech-box .prompt {
  margin: 0;
  font-size: 17px;
  font-weight: 650;
  color: var(--ink);
}

.practice-form-area label {
  margin-bottom: 6px;
}

.practice-textarea-box {
  position: relative;
  margin-top: 4px;
}

.practice-char-count {
  position: absolute;
  right: 12px;
  bottom: 10px;
  font-size: 11.5px;
  color: var(--muted-light);
  font-variant-numeric: tabular-nums;
}

.submit-practice-btn {
  margin-top: 14px;
  min-height: 48px;
  font-size: 15.5px;
}

/* 完成态 */
.practice-complete-card {
  text-align: center;
  padding: 32px 20px;
}

.complete-icon {
  font-size: 36px;
  margin-bottom: 10px;
}

.practice-complete-card h2 {
  font-size: 20px;
  margin-bottom: 8px;
}

.practice-complete-card p {
  color: var(--muted);
  max-width: 340px;
  margin: 0 auto;
}

/* 对比表格现代化 */
.comparison-heading,
.history-heading {
  margin-top: 24px;
}

.sub-hint {
  font-size: 12px;
  color: var(--muted);
}

.modern-comparison {
  overflow-x: auto;
  border: 1px solid var(--card-border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow);
  margin-top: 8px;
}

.modern-comparison table {
  width: 100%;
  border-collapse: collapse;
}

.modern-comparison caption {
  text-align: left;
  font-weight: 700;
  padding: 12px 14px 8px;
  font-size: 13.5px;
  color: var(--muted);
}

.modern-comparison th,
.modern-comparison td {
  padding: 12px 14px;
  border-bottom: 1px solid var(--line);
  font-size: 13px;
}

.modern-comparison thead th {
  background: color-mix(in srgb, var(--ink) 3%, var(--surface));
  font-weight: 700;
  color: var(--ink);
  white-space: nowrap;
}

.modern-comparison tbody th {
  font-weight: 600;
  color: var(--ink);
  min-width: 120px;
}

.modern-comparison td {
  white-space: nowrap;
}

.status-cell-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 650;
}

.status-cell-tag.已满足 {
  background: var(--status-met-bg);
  color: var(--status-met);
}

.status-cell-tag.未说明,
.status-cell-tag.需要澄清 {
  background: var(--status-warn-bg);
  color: var(--status-warn);
}

.status-cell-tag.存在错误 {
  background: var(--status-bad-bg);
  color: var(--status-bad);
}

/* 结果卡片 */
.practice-result-card {
  padding: 18px 20px;
  margin-bottom: 14px;
  border-radius: var(--radius-lg);
}

.result-stage-tag {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  background: var(--accent-soft);
  color: var(--accent);
}

.result-score {
  font-size: 16px;
  font-weight: 800;
  color: var(--accent);
  margin-left: 8px;
}

.result-score .denom {
  font-size: 12px;
  font-weight: normal;
  color: var(--muted);
}

.result-next-action {
  font-size: 13.5px;
  color: var(--ink-secondary);
  margin: 6px 0 12px;
}

.detail-disclosure {
  margin-top: 10px;
}

.detail-prompt-box,
.detail-answer-box {
  margin: 8px 0;
  font-size: 13px;
  line-height: 1.55;
}

.detail-prompt-box strong,
.detail-answer-box strong {
  display: block;
  font-size: 12.5px;
  color: var(--muted);
  margin-bottom: 2px;
}

.review-answer {
  white-space: pre-wrap;
  margin: 0;
}
</style>
