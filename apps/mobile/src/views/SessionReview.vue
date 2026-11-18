<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { SessionReview as ReviewRecord } from '@interview-assistant/contracts';
import { address, api, message } from '../connection';
import RubricFeedback from '../components/RubricFeedback.vue';
import ReferenceAnswer from '../components/ReferenceAnswer.vue';
import VoiceAnswer from '../components/VoiceAnswer.vue';

const props = defineProps<{ id: string }>();
const data = ref<ReviewRecord>();
const error = ref('');
const disputeDraft = ref<Record<string, string>>({});
const disputeStatus = ref<Record<string, string>>({});
const disputeBusy = ref<Record<string, boolean>>({});
const markedReferences = new Set<string>();
const learningLinks = ref<Record<string, string>>({});
const learningBusy = ref<Record<string, boolean>>({});
const learningError = ref<Record<string, string>>({});

async function collectQuestion(questionId: string) {
  if (learningBusy.value[questionId]) return;
  learningBusy.value[questionId] = true;
  learningError.value[questionId] = '';
  try {
    learningLinks.value[questionId] = (await api.importLearning(questionId)).id;
  } catch (cause) {
    learningError.value[questionId] = message(cause);
  } finally {
    learningBusy.value[questionId] = false;
  }
}
let generation = 0;

const groups = computed(
  () =>
    data.value?.questions
      .filter(
        (question) =>
          !question.parentQuestionId ||
          !data.value!.questions.some((parent) => parent.id === question.parentQuestionId),
      )
      .map((question) => ({
        question,
        followUps: data.value!.questions.filter((item) => item.parentQuestionId === question.id),
      })) ?? [],
);
const days = computed(() =>
  [...(data.value?.report?.nextPlan ?? [])].sort((a, b) => a.day - b.day),
);

async function load() {
  const ticket = ++generation;
  error.value = '';
  try {
    const result = await api.getSessionReview(props.id);
    if (ticket === generation) data.value = result;
  } catch (cause) {
    if (ticket === generation) error.value = message(cause);
  }
}
async function markReference(event: Event, id: string) {
  const disclosure = event.currentTarget as HTMLDetailsElement;
  if (!disclosure.open || data.value?.status !== 'active' || markedReferences.has(id)) return;
  try {
    await api.markReferenceViewed(id);
    markedReferences.add(id);
  } catch {
    disputeStatus.value[id] = '查看记录保存失败，可重新展开重试。';
  }
}
async function dispute(questionId: string) {
  const reason = disputeDraft.value[questionId]?.trim();
  if (!reason || disputeBusy.value[questionId]) return;
  disputeBusy.value[questionId] = true;
  try {
    await api.submitScoreDispute(questionId, reason);
    disputeStatus.value[questionId] = '复核意见已记录';
  } catch (cause) {
    disputeStatus.value[questionId] = message(cause);
  } finally {
    disputeBusy.value[questionId] = false;
  }
}
onMounted(() => void load());
watch(
  () => props.id,
  () => void load(),
);
</script>

<template>
  <header>
    <router-link to="/records">‹ 训练记录</router-link>
    <router-link to="/prepare">新建训练</router-link>
  </header>

  <div v-if="error" class="panel">
    <p role="alert">{{ error }}</p>
    <button @click="load">重试</button>
  </div>
  <p v-else-if="!data" class="loading-status" role="status">
    <span class="loading-spinner" aria-hidden="true"></span>
    正在读取深度复盘报告…
  </p>
  <template v-else>
    <!-- 复盘概览头卡片 -->
    <section class="panel review-hero-card">
      <div class="review-meta-top">
        <small class="time-stamp">
          {{ new Date(data.startedAt).toLocaleString('zh-CN') }}
          <template v-if="data.company"> · {{ data.company }}</template>
        </small>
        <span class="status-chip" :class="data.status">
          {{ data.status === 'completed' ? '测评已归档' : data.status === 'awaiting_finish' ? '待出完整报告' : '进行中' }}
        </span>
      </div>

      <h1 class="target-role-title">{{ data.targetRole }}</h1>

      <div class="badges-row">
        <span class="meta-tag">{{ data.round }}</span>
        <span class="meta-tag">{{ data.language }}</span>
        <span class="meta-tag">{{ data.difficulty.toUpperCase() }}</span>
        <span class="meta-tag progress-tag">
          已答 {{ data.answeredMainQuestionCount }} / {{ data.mainQuestionCount }} 题
          <template v-if="data.followUpCount"> · {{ data.followUpCount }} 追问</template>
        </span>
      </div>

      <router-link
        v-if="data.status !== 'completed'"
        class="button-link primary-link resume-btn"
        :to="'/training/' + encodeURIComponent(id)"
      >
        {{ data.status === 'awaiting_finish' ? '生成报告' : '继续这场训练' }}
      </router-link>
    </section>

    <!-- 总体能力战报卡片 -->
    <template v-if="data.report">
      <section class="report-band ai-score-hero">
        <div class="score-hero-header">
          <small class="score-version">AI 智能测评战报 · {{ data.report.scoringVersion ?? 'standard-v1' }}</small>
          <span class="status-badge" :class="data.report.assessmentStatus">
            {{ data.report.assessmentStatus === 'complete' ? '四维全测评' : '部分维度未测' }}
          </span>
        </div>

        <div class="score-showcase">
          <h2 class="huge-score">
            {{
              data.report.overallScore === null
                ? '未测评'
                : String(Math.round(data.report.overallScore))
            }}
            <span v-if="data.report.overallScore !== null" class="score-denom">/ 100</span>
          </h2>
          <div class="score-status-summary">
            <span class="score-eval-level">
              {{
                data.report.overallScore === null
                  ? '尚未完成'
                  : data.report.overallScore >= 85
                    ? '表现卓越 · 极佳匹配'
                    : data.report.overallScore >= 70
                      ? '表现良好 · 具备实力'
                      : '有待加强 · 建议专项巩固'
              }}
            </span>
          </div>
        </div>

        <div class="report-summary-bubble">
          <span class="ai-spark-icon">✦</span>
          <p>{{ data.report.summary }}</p>
        </div>
      </section>

      <!-- 四维能力雷达矩阵 -->
      <section class="panel competency-panel">
        <div class="section-heading">
          <h2>四维能力矩阵</h2>
          <span class="sub-hint">5 分制能力评测</span>
        </div>
        <div class="score-grid">
          <article
            v-for="(score, competency) in data.report.competencyScores"
            :key="competency"
            class="score-item"
            :class="{ 'has-score': score !== null }"
          >
            <div class="score-item-top">
              <span class="competency-name">{{ competency }}</span>
              <strong class="competency-val">{{ score === null ? '未测评' : String(score) + ' / 5' }}</strong>
            </div>
            <progress v-if="score !== null" max="5" :value="score"></progress>
          </article>
        </div>
      </section>

      <!-- 优势与改进方向双栏对比卡 -->
      <section class="panel feedback-grid-panel">
        <div class="feedback-grid">
          <div class="feedback-col strengths-col">
            <h3 class="col-title"><span class="check-icon">✓</span> 核心优势</h3>
            <ul>
              <li v-for="(item, index) in data.report.strengths" :key="index">{{ item }}</li>
            </ul>
          </div>
          <div class="feedback-col gaps-col">
            <h3 class="col-title"><span class="gap-icon">⚡</span> 训练重点</h3>
            <ul>
              <li v-for="(item, index) in data.report.gaps" :key="index">{{ item }}</li>
            </ul>
          </div>
        </div>
      </section>

      <!-- 7 天进阶突破时间线 -->
      <section class="panel roadmap-panel">
        <div class="section-heading">
          <h2>7 天突破行动指南</h2>
          <span class="sub-hint">AI 定制计划</span>
        </div>
        <div class="timeline-container">
          <article v-for="day in days" :key="day.day" class="timeline-step">
            <div class="step-marker">
              <span class="step-num">{{ day.day }}</span>
              <span class="step-line"></span>
            </div>
            <div class="step-content">
              <div class="step-header">
                <strong>第 {{ day.day }} 天 · {{ day.focus }}</strong>
              </div>
              <p class="step-task">{{ day.task }}</p>
              <small class="step-reason">{{ day.reason }}</small>
            </div>
          </article>
        </div>
      </section>
    </template>
    <p v-else class="muted">这场训练尚未生成报告。</p>

    <!-- 逐题复盘列表 -->
    <div class="section-heading review-section-head">
      <h2>逐题深入复盘</h2>
      <span class="sub-hint">题目解析与复盘依据</span>
    </div>

    <section v-for="group in groups" :key="group.question.id" class="question-group">
      <article
        v-for="q in [group.question, ...group.followUps]"
        :key="q.id"
        class="panel question-review-card"
        :class="{ 'is-followup-card': !!q.parentQuestionId }"
      >
        <div class="section-heading card-header">
          <div class="q-header-text">
            <div class="q-tags-row">
              <span class="q-role-badge" :class="{ followup: !!q.parentQuestionId }">
                {{ q.parentQuestionId ? '关联追问' : '主问题' }}
              </span>
              <span class="q-dim-tag">{{ q.competency }}</span>
              <span class="q-diff-tag">{{ q.difficulty.toUpperCase() }}</span>
            </div>
            <h3 class="q-prompt-title">{{ q.prompt }}</h3>
          </div>
          <div class="q-score-badge">
            <strong v-if="q.answer?.cue" class="q-score-val">{{ q.answer.cue.score }} <span class="denom">/ 5</span></strong>
            <span v-else class="q-status-text">{{ q.skippedAt ? '已跳过' : q.answer ? '暂无评分' : '未作答' }}</span>
          </div>
        </div>

        <VoiceAnswer
          :key="JSON.stringify([address, id, q.id])"
          :clip-key="JSON.stringify([address, 'session', id, q.id])"
          :readonly="true"
        />

        <template v-if="q.answer">
          <div
            v-if="!q.parentQuestionId && q.rubricSnapshot && q.answer.cue?.rubricEvaluation"
            class="actions collect-actions"
          >
            <router-link
              v-if="learningLinks[q.id]"
              class="button-link collected-link"
              :to="'/learn/' + encodeURIComponent(learningLinks[q.id]!)"
            >
              已收藏 · 去重答与对比 ›
            </router-link>
            <button v-else class="collect-btn" :disabled="learningBusy[q.id]" @click="collectQuestion(q.id)">
              {{ learningBusy[q.id] ? '正在收藏…' : '⭐ 收藏到练习本' }}
            </button>
            <p v-if="learningError[q.id]" role="alert">{{ learningError[q.id] }}</p>
          </div>

          <!-- 我的回答文本 -->
          <div class="my-answer-box">
            <h4 class="answer-box-title">我的回答</h4>
            <p class="review-answer">{{ q.answer.answerText }}</p>
          </div>

          <!-- 考官评价与逐项 Rubric -->
          <template v-if="q.answer.cue">
            <RubricFeedback
              v-if="q.answer.cue.rubricEvaluation"
              :evaluation="q.answer.cue.rubricEvaluation"
              :snapshot="q.rubricSnapshot"
            />

            <div class="feedback-grid sub-feedback-grid">
              <div v-if="q.answer.cue.strengths.length" class="feedback-col strengths-col">
                <h4 class="col-title"><span class="check-icon">✓</span> 回答亮点</h4>
                <ul>
                  <li v-for="(item, n) in q.answer.cue.strengths" :key="n">{{ item }}</li>
                </ul>
              </div>
              <div v-if="q.answer.cue.gaps.length" class="feedback-col gaps-col">
                <h4 class="col-title"><span class="gap-icon">⚡</span> 改进方向</h4>
                <ul>
                  <li v-for="(item, n) in q.answer.cue.gaps" :key="n">{{ item }}</li>
                </ul>
              </div>
            </div>

            <div class="next-action-card">
              <strong>💡 下一步进阶建议：</strong>{{ q.answer.cue.nextAction }}
            </div>

            <!-- 依据证据展开 -->
            <details class="evidence-disclosure">
              <summary>评分依据 · {{ q.answer.cue.evidence.length }} 条原文考证</summary>
              <blockquote v-for="(evidence, n) in q.answer.cue.evidence" :key="n">
                <small class="evidence-src">{{ evidence.source }}</small>
                <p>{{ evidence.quote }}</p>
              </blockquote>
            </details>

            <!-- 参考答案展开 -->
            <details v-if="q.answer.cue.referenceAnswer" class="reference-disclosure" @toggle="markReference($event, q.id)">
              <summary>查看本题参考答案</summary>
              <p v-if="q.referenceViewedAt" class="muted viewed-hint">曾在此场练习中查看过参考答案</p>
              <p v-if="disputeStatus[q.id]" role="status">{{ disputeStatus[q.id] }}</p>
              <ReferenceAnswer :answer="q.answer.cue.referenceAnswer" />
            </details>

            <!-- 申诉与复核 -->
            <details class="dispute-disclosure">
              <summary>对此评分有异议</summary>
              <p v-if="q.dispute" class="dispute-history">已提交异议：{{ q.dispute }}</p>
              <textarea
                v-model="disputeDraft[q.id]"
                rows="3"
                maxlength="1000"
                placeholder="具体指出评分项、作答原文与理解分歧…"
              ></textarea>
              <button
                class="quiet dispute-save-btn"
                :disabled="disputeBusy[q.id] || !disputeDraft[q.id]?.trim()"
                @click="dispute(q.id)"
              >
                保存复核意见
              </button>
              <small role="status">{{ disputeStatus[q.id] }}</small>
            </details>

            <!-- 针对练习导航 -->
            <nav
              v-if="
                !q.parentQuestionId &&
                data.status === 'completed' &&
                q.rubricSnapshot &&
                q.answer.cue.rubricEvaluation
              "
              class="practice-actions-nav"
              aria-label="专项练习"
            >
              <template
                v-for="item in q.answer.cue.rubricEvaluation.items.filter(
                  (criterion) => criterion.status !== 'met',
                )"
                :key="item.criterionId"
              >
                <router-link
                  class="button-link practice-chip-link"
                  :to="
                    '/practice/' +
                    encodeURIComponent(id) +
                    '/' +
                    encodeURIComponent(q.id) +
                    '/' +
                    encodeURIComponent(item.criterionId) +
                    '?language=' +
                    encodeURIComponent(data.language)
                  "
                >
                  🎯 {{
                    q.rubricSnapshot?.criteria.find(
                      (criterion) => criterion.id === item.criterionId,
                    )?.description ?? item.criterionId
                  }} · 针对练习
                </router-link>
              </template>
            </nav>
          </template>
          <p v-else class="muted">暂无可展示的反馈。</p>
        </template>
        <p v-else class="muted">{{ q.skippedAt ? '本题已跳过，不参与评分。' : '本题未作答。' }}</p>
      </article>
    </section>
  </template>
</template>

<style scoped>
/* 概览头卡片 */
.review-hero-card {
  padding: 22px;
  background: var(--surface);
  border: 1px solid var(--card-border);
}

.review-meta-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.time-stamp {
  color: var(--muted);
  font-size: 13px;
}

.status-chip {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 600;
  background: var(--accent-soft);
  color: var(--accent);
}

.status-chip.completed {
  background: var(--status-met-bg);
  color: var(--status-met);
}

.target-role-title {
  margin: 6px 0 12px;
  font-size: clamp(22px, 5.5vw, 26px);
  font-weight: 800;
}

.badges-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}

.meta-tag {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 550;
  color: var(--ink-secondary);
  background: color-mix(in srgb, var(--ink) 5%, var(--surface));
  text-transform: capitalize;
}

.progress-tag {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.resume-btn {
  width: 100%;
  margin-top: 10px;
}

/* 总体战报卡片 */
.ai-score-hero {
  padding: 24px 22px;
  margin-bottom: 16px;
  border-radius: var(--radius-xl);
  color: var(--hero-ink);
  background:
    radial-gradient(90% 120% at 90% 10%, rgba(255, 255, 255, 0.22) 0%, transparent 60%),
    linear-gradient(145deg, #108764 0%, #064d39 100%);
  box-shadow: 0 14px 36px rgba(6, 77, 57, 0.26);
}

.score-hero-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.score-version {
  color: var(--hero-muted);
  font-size: 12.5px;
  font-weight: 500;
}

.status-badge {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.2);
  color: #ffffff;
}

.score-showcase {
  margin-bottom: 16px;
}

.huge-score {
  font-size: clamp(48px, 14vw, 68px);
  font-weight: 900;
  letter-spacing: -0.04em;
  line-height: 1;
  margin: 0;
  color: #ffffff;
}

.score-denom {
  font-size: 20px;
  font-weight: 600;
  color: var(--hero-muted);
  letter-spacing: 0;
}

.score-status-summary {
  margin-top: 8px;
}

.score-eval-level {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.25);
  color: #ffffff;
}

.report-summary-bubble {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.18);
  font-size: 13.5px;
  line-height: 1.6;
}

.report-summary-bubble p {
  margin: 0;
  color: var(--hero-ink);
}

.ai-spark-icon {
  font-size: 14px;
  color: #a4f2d3;
}

/* 四维能力矩阵 */
.competency-panel {
  padding: 22px;
}

.sub-hint {
  font-size: 12.5px;
  color: var(--muted);
}

.score-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(135px, 1fr));
  gap: 12px;
  margin-top: 6px;
}

.score-item {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 8px;
  padding: 14px;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--ink) 3%, var(--surface));
  border: 1px solid var(--line);
}

.score-item-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
}

.competency-name {
  font-size: 13.5px;
  font-weight: 650;
  color: var(--ink);
}

.competency-val {
  font-size: 13.5px;
  font-weight: 750;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}

.score-item progress {
  margin: 0;
  height: 6px;
}

/* 优势与改进方向双栏 */
.feedback-grid-panel {
  padding: 20px;
}

.feedback-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
}

@media (min-width: 480px) {
  .feedback-grid {
    grid-template-columns: 1fr 1fr;
  }
}

.feedback-col {
  padding: 14px;
  border-radius: var(--radius-md);
  font-size: 13.5px;
}

.feedback-col .col-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  margin: 0 0 8px;
}

.feedback-col ul {
  margin: 0;
  padding-left: 18px;
}

.feedback-col li {
  margin-bottom: 5px;
  line-height: 1.5;
}

.strengths-col {
  background: var(--status-met-bg);
  color: var(--status-met);
  border: 1px solid color-mix(in srgb, var(--status-met) 22%, transparent);
}

.gaps-col {
  background: var(--status-warn-bg);
  color: var(--status-warn);
  border: 1px solid color-mix(in srgb, var(--status-warn) 22%, transparent);
}

/* 7天时间线 */
.roadmap-panel {
  padding: 22px;
}

.timeline-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 10px;
}

.timeline-step {
  display: flex;
  gap: 14px;
  position: relative;
}

.step-marker {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 26px;
  flex-shrink: 0;
}

.step-num {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--accent-gradient);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 750;
  box-shadow: 0 2px 6px color-mix(in srgb, var(--accent) 30%, transparent);
}

.step-line {
  flex: 1;
  width: 2px;
  background: color-mix(in srgb, var(--accent) 25%, transparent);
  margin-top: 4px;
  min-height: 20px;
}

.timeline-step:last-child .step-line {
  display: none;
}

.step-content {
  flex: 1;
  padding-bottom: 8px;
}

.step-header strong {
  font-size: 14.5px;
  color: var(--ink);
}

.step-task {
  font-size: 13.5px;
  color: var(--ink-secondary);
  margin: 4px 0 6px;
  line-height: 1.5;
}

.step-reason {
  display: block;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.45;
}

/* 逐题复盘列表 */
.review-section-head {
  margin-top: 24px;
  margin-bottom: 12px;
}

.question-review-card {
  padding: 20px;
  margin-bottom: 16px;
  border-radius: var(--radius-lg);
}

.question-review-card.is-followup-card {
  margin-left: 8px;
  border-left: 3px solid var(--accent);
}

.card-header {
  align-items: flex-start;
  margin-bottom: 12px;
}

.q-header-text {
  flex: 1;
  min-width: 0;
}

.q-tags-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.q-role-badge {
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 650;
  background: var(--accent-soft);
  color: var(--accent);
}

.q-role-badge.followup {
  background: var(--status-warn-bg);
  color: var(--status-warn);
}

.q-dim-tag,
.q-diff-tag {
  font-size: 11px;
  color: var(--muted);
  background: color-mix(in srgb, var(--ink) 4%, var(--surface));
  padding: 1px 6px;
  border-radius: 4px;
}

.q-prompt-title {
  font-size: 16px;
  line-height: 1.45;
  margin: 0;
  color: var(--ink);
}

.q-score-badge {
  flex-shrink: 0;
}

.q-score-val {
  font-size: 16px;
  font-weight: 800;
  color: var(--accent);
}

.q-score-val .denom {
  font-size: 12px;
  color: var(--muted);
  font-weight: normal;
}

.q-status-text {
  font-size: 12.5px;
  color: var(--muted);
}

.collect-actions {
  margin: 10px 0 14px;
}

.collect-btn {
  font-size: 13px;
  min-height: 38px;
  padding: 6px 14px;
}

.collected-link {
  font-size: 13px;
  min-height: 38px;
  padding: 6px 14px;
  background: var(--accent-soft);
  color: var(--accent);
  border-color: transparent;
}

.my-answer-box {
  padding: 12px 14px;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--ink) 2%, var(--surface));
  border: 1px solid var(--line);
  margin: 12px 0 14px;
}

.answer-box-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--muted);
  margin: 0 0 6px;
}

.review-answer {
  white-space: pre-wrap;
  font-size: 14px;
  line-height: 1.6;
  margin: 0;
  color: var(--ink);
}

.sub-feedback-grid {
  margin: 12px 0;
}

.next-action-card {
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--accent) 6%, var(--surface));
  border-left: 3px solid var(--accent);
  font-size: 13px;
  margin: 10px 0;
}

.evidence-disclosure,
.reference-disclosure,
.dispute-disclosure {
  margin-top: 12px;
}

.evidence-src {
  color: var(--muted);
  font-weight: 600;
}

.viewed-hint {
  font-size: 12px;
  margin: 4px 0 8px;
}

.dispute-history {
  font-size: 12.5px;
  color: var(--muted);
  margin-bottom: 6px;
}

.dispute-save-btn {
  margin-top: 8px;
}

.practice-actions-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.practice-chip-link {
  font-size: 12.5px;
  min-height: 36px;
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  border-color: transparent;
  font-weight: 650;
}

.practice-chip-link:active {
  background: var(--accent-soft-hover);
}
</style>
