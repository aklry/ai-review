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
    <router-link to="/records">‹ 训练记录</router-link
    ><router-link to="/prepare">新建训练</router-link>
  </header>
  <h1>{{ data?.targetRole ?? '训练复盘' }}</h1>
  <div v-if="error">
    <p role="alert">{{ error }}</p>
    <button @click="load">重试</button>
  </div>
  <p v-else-if="!data" role="status">正在读取报告…</p>
  <template v-else>
    <section class="panel">
      <small
        >{{ new Date(data.startedAt).toLocaleString('zh-CN') }} ·
        {{ data.company ?? '未指定公司' }}</small
      >
      <h2>{{ data.targetRole }}</h2>
      <p>{{ data.round }} · {{ data.language }} · {{ data.difficulty.toUpperCase() }}</p>
      <p>
        已答 {{ data.answeredMainQuestionCount }} / {{ data.mainQuestionCount }} 道主问题 ·
        {{ data.followUpCount }} 道追问
      </p>
      <router-link
        v-if="data.status !== 'completed'"
        class="button-link primary-link"
        :to="'/training/' + encodeURIComponent(id)"
      >
        {{ data.status === 'awaiting_finish' ? '生成报告' : '继续这场训练' }}
      </router-link>
    </section>

    <template v-if="data.report">
      <section class="report-band">
        <small>训练报告 · {{ data.report.scoringVersion ?? 'legacy-v1' }}</small>
        <h2>
          {{
            data.report.overallScore === null
              ? '未测评'
              : String(Math.round(data.report.overallScore)) + ' / 100'
          }}
        </h2>
        <p>{{ data.report.summary }}</p>
        <p>
          {{
            data.report.assessmentStatus === 'complete' ? '四个维度均已覆盖' : '部分维度尚未测评'
          }}
        </p>
      </section>
      <section class="panel">
        <h2>四维评分</h2>
        <div class="score-grid">
          <article
            v-for="(score, competency) in data.report.competencyScores"
            :key="competency"
            class="score-item"
          >
            <span>{{ competency }}</span
            ><strong>{{ score === null ? '未测评' : String(score) + ' / 5' }}</strong>
            <progress v-if="score !== null" max="5" :value="score"></progress>
          </article>
        </div>
      </section>
      <section class="panel feedback-grid">
        <div>
          <h3>优势</h3>
          <ul>
            <li v-for="(item, index) in data.report.strengths" :key="index">{{ item }}</li>
          </ul>
        </div>
        <div>
          <h3>训练重点</h3>
          <ul>
            <li v-for="(item, index) in data.report.gaps" :key="index">{{ item }}</li>
          </ul>
        </div>
      </section>
      <section class="panel">
        <h2>7 天训练计划</h2>
        <article v-for="day in days" :key="day.day" class="plan-day">
          <strong>第 {{ day.day }} 天 · {{ day.focus }}</strong>
          <p>{{ day.task }}</p>
          <small>{{ day.reason }}</small>
        </article>
      </section>
    </template>
    <p v-else class="muted">这场训练尚未生成报告。</p>

    <h2>逐题复盘</h2>
    <section v-for="group in groups" :key="group.question.id" class="question-group">
      <article
        v-for="q in [group.question, ...group.followUps]"
        :key="q.id"
        class="panel question-review"
      >
        <div class="section-heading">
          <div>
            <small
              >{{ q.parentQuestionId ? '关联追问' : '主问题' }} · {{ q.competency }} ·
              {{ q.difficulty.toUpperCase() }}</small
            >
            <h3>{{ q.prompt }}</h3>
          </div>
          <strong v-if="q.answer?.cue">{{ q.answer.cue.score }} / 5</strong>
          <span v-else>{{ q.skippedAt ? '已跳过' : q.answer ? '暂无评分' : '未作答' }}</span>
        </div>
        <VoiceAnswer
          :key="JSON.stringify([address, id, q.id])"
          :clip-key="JSON.stringify([address, 'session', id, q.id])"
          :readonly="true"
        />
        <template v-if="q.answer">
          <h3>我的回答</h3>
          <p class="review-answer">{{ q.answer.answerText }}</p>
          <template v-if="q.answer.cue">
            <RubricFeedback
              v-if="q.answer.cue.rubricEvaluation"
              :evaluation="q.answer.cue.rubricEvaluation"
              :snapshot="q.rubricSnapshot"
            />
            <div class="feedback-grid">
              <div>
                <h3>回答亮点</h3>
                <ul>
                  <li v-for="(item, n) in q.answer.cue.strengths" :key="n">{{ item }}</li>
                </ul>
              </div>
              <div>
                <h3>改进方向</h3>
                <ul>
                  <li v-for="(item, n) in q.answer.cue.gaps" :key="n">{{ item }}</li>
                </ul>
              </div>
            </div>
            <p><strong>下一步：</strong>{{ q.answer.cue.nextAction }}</p>
            <details>
              <summary>评分依据 · {{ q.answer.cue.evidence.length }} 条</summary>
              <blockquote v-for="(evidence, n) in q.answer.cue.evidence" :key="n">
                <small>{{ evidence.source }}</small>
                <p>{{ evidence.quote }}</p>
              </blockquote>
            </details>
            <details v-if="q.answer.cue.referenceAnswer" @toggle="markReference($event, q.id)">
              <summary>查看本题参考答案</summary>
              <p v-if="q.referenceViewedAt">曾查看参考答案</p>
              <p v-if="disputeStatus[q.id]" role="status">{{ disputeStatus[q.id] }}</p>
              <ReferenceAnswer :answer="q.answer.cue.referenceAnswer" />
            </details>
            <details>
              <summary>对此评分有异议</summary>
              <p v-if="q.dispute">已提交：{{ q.dispute }}</p>
              <textarea
                v-model="disputeDraft[q.id]"
                rows="3"
                maxlength="1000"
                placeholder="指出评分项、原文和分歧"
              ></textarea>
              <button
                :disabled="disputeBusy[q.id] || !disputeDraft[q.id]?.trim()"
                @click="dispute(q.id)"
              >
                保存复核意见
              </button>
              <small role="status">{{ disputeStatus[q.id] }}</small>
            </details>
            <nav
              v-if="
                !q.parentQuestionId &&
                data.status === 'completed' &&
                q.rubricSnapshot &&
                q.answer.cue.rubricEvaluation
              "
              aria-label="专项练习"
            >
              <template
                v-for="item in q.answer.cue.rubricEvaluation.items.filter(
                  (criterion) => criterion.status !== 'met',
                )"
                :key="item.criterionId"
              >
                <router-link
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
                  {{
                    q.rubricSnapshot?.criteria.find(
                      (criterion) => criterion.id === item.criterionId,
                    )?.description ?? item.criterionId
                  }}
                  · 专项练习
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
.score-grid,
.feedback-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 14px;
}
.score-item,
.plan-day {
  border-top: 1px solid var(--line);
  padding-top: 12px;
}
.score-item {
  display: grid;
  gap: 6px;
}
.score-item progress {
  margin: 0;
}
.section-heading {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}
.section-heading h3 {
  margin-top: 5px;
}
.report-band {
  padding: 18px 0;
  border-block: 1px solid var(--line);
  margin-bottom: 18px;
}
.report-band h2 {
  margin: 6px 0;
}
.question-group {
  border-left: 2px solid var(--line);
  padding-left: 12px;
}
.question-review {
  margin-bottom: 14px;
}
.review-answer {
  white-space: pre-wrap;
}
nav[aria-label='专项练习'] {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 14px;
}
</style>
