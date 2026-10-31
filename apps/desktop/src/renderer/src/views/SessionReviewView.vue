<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue';
import { useHistoryStore } from '../stores/history.js';
import QuestionReviewCard from '../components/QuestionReviewCard.vue';
import {
  competencyLabels,
  formatInterviewDate,
  languageLabels,
  roundLabels,
  statusLabels,
} from '../lib/interview-labels.js';

const props = defineProps<{ sessionId: string }>();
const history = useHistoryStore();
const review = computed(() => history.review);
const groups = computed(
  () =>
    review.value?.questions
      .filter((q) => !q.parentQuestionId)
      .map((question, index) => ({
        question,
        number: index + 1,
        followUps: review.value!.questions.filter((q) => q.parentQuestionId === question.id),
      })) ?? [],
);
const orphanFollowUps = computed(
  () =>
    review.value?.questions.filter(
      (q) =>
        q.parentQuestionId &&
        !review.value!.questions.some((parent) => parent.id === q.parentQuestionId),
    ) ?? [],
);
const days = computed(() =>
  [...(review.value?.report?.nextPlan ?? [])].sort((a, b) => a.day - b.day),
);
onMounted(() => {
  void history.loadReview(props.sessionId);
});
watch(
  () => props.sessionId,
  (id) => {
    void history.loadReview(id);
  },
);
onBeforeUnmount(history.cancelReview);
</script>

<template>
  <section class="view history-view" :aria-busy="history.reviewLoading">
    <header class="view-header">
      <div>
        <p class="eyebrow">让每一次回答都有积累</p>
        <h1>逐题复盘</h1>
      </div>
      <RouterLink to="/history" class="history-link">← 返回历史训练</RouterLink>
    </header>
    <el-skeleton v-if="history.reviewLoading" :rows="8" animated />
    <div v-else-if="history.reviewError" role="alert" class="history-error">
      <p>{{ history.reviewError }}</p>
      <el-button @click="history.loadReview(sessionId)">重试</el-button>
    </div>
    <template v-else-if="review">
      <section class="history-card review-overview">
        <div class="history-card-heading">
          <div>
            <h2>{{ review.targetRole }}</h2>
            <p class="history-muted">
              {{ review.company ?? '未指定公司' }} · {{ formatInterviewDate(review.startedAt) }}
            </p>
          </div>
          <el-tag>{{ statusLabels[review.status] }}</el-tag>
        </div>
        <div class="history-card-meta">
          <span
            >{{ languageLabels[review.language] }} · {{ roundLabels[review.round] }} ·
            {{ review.difficulty.toUpperCase() }}</span
          ><span
            >主问题已答 {{ review.answeredMainQuestionCount }} /
            {{ review.mainQuestionCount }}</span
          >
        </div>
        <p class="history-muted">追问用于补充证据，不重复计入主问题均分。</p>
        <RouterLink
          v-if="review.status !== 'completed'"
          :to="{ path: '/training', query: { sessionId: review.id } }"
          class="history-link"
          >{{
            review.status === 'awaiting_finish' ? '返回训练生成报告' : '继续这场训练'
          }}
          →</RouterLink
        >
      </section>
      <section v-if="review.report" class="history-card review-report" aria-label="训练报告">
        <div class="history-card-heading">
          <div>
            <p class="section-label">
              训练报告 · {{ review.report.scoringVersion ?? 'legacy-v1' }}
            </p>
            <h2>
              {{
                review.report.overallScore === null
                  ? '未测评'
                  : `${Math.round(review.report.overallScore)} / 100`
              }}
            </h2>
          </div>
          <span class="history-muted">{{
            review.report.assessmentStatus === 'complete' ? '四维已覆盖' : '部分维度尚未测评'
          }}</span>
        </div>
        <p>{{ review.report.summary }}</p>
        <div class="score-grid">
          <article
            v-for="(score, competency) in review.report.competencyScores"
            :key="competency"
            class="score-item"
          >
            <span>{{ competencyLabels[competency] }}</span
            ><strong>{{ score === null ? '未测评' : `${score} / 5` }}</strong
            ><el-progress
              v-if="score !== null"
              :percentage="score * 20"
              :show-text="false"
              :stroke-width="6"
            />
          </article>
        </div>
        <div class="review-feedback-columns">
          <div>
            <h3>优势</h3>
            <ul>
              <li v-for="(item, index) in review.report.strengths" :key="index">{{ item }}</li>
            </ul>
          </div>
          <div>
            <h3>训练重点</h3>
            <ul>
              <li v-for="(item, index) in review.report.gaps" :key="index">{{ item }}</li>
            </ul>
          </div>
        </div>
        <h3>7 天训练计划</h3>
        <p v-if="review.report.scoringVersion === 'legacy-v1'" class="history-muted">
          旧版计划按历史记录原样保留。
        </p>
        <article v-for="(day, index) in days" :key="index" class="plan-item">
          <strong>第 {{ day.day }} 天</strong><span>{{ day.task }}</span
          ><small>{{ day.reason }}</small>
        </article>
      </section>
      <p v-else class="history-muted">这场训练尚未生成报告，已保存的问答和反馈仍可逐题查看。</p>
      <div class="history-list" aria-label="完整问答与反馈">
        <section v-for="group in groups" :key="group.question.id" class="question-group">
          <QuestionReviewCard :question="group.question" :label="`主问题 ${group.number}`" />
          <QuestionReviewCard
            v-for="followUp in group.followUps"
            :key="followUp.id"
            :question="followUp"
            :label="`主问题 ${group.number} 的追问`"
          />
        </section>
        <QuestionReviewCard
          v-for="followUp in orphanFollowUps"
          :key="followUp.id"
          :question="followUp"
          label="历史追问"
        />
      </div>
    </template>
  </section>
</template>
