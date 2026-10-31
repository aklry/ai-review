<script setup lang="ts">
import type { SessionReview } from '@interview-assistant/contracts';
import { competencyLabels, sourceLabels } from '../lib/interview-labels.js';
defineProps<{ question: SessionReview['questions'][number]; label: string }>();
</script>

<template>
  <article
    class="history-card question-review"
    :class="{ 'followup-review': question.parentQuestionId }"
  >
    <div class="history-card-heading">
      <div>
        <p class="section-label">
          {{ label }} · {{ competencyLabels[question.competency] }} ·
          {{ question.difficulty.toUpperCase() }}
        </p>
        <h2>{{ question.prompt }}</h2>
      </div>
      <el-tag v-if="question.answer?.cue" type="success"
        >{{ question.answer.cue.score }} / 5</el-tag
      >
      <el-tag v-else type="info">{{ question.answer ? '暂无评分' : '未作答' }}</el-tag>
    </div>
    <template v-if="question.answer">
      <p class="section-label">我的回答</p>
      <p class="review-answer">{{ question.answer.answerText }}</p>
      <template v-if="question.answer.cue">
        <div class="review-feedback-columns">
          <div>
            <h3>回答亮点</h3>
            <ul>
              <li v-for="(item, index) in question.answer.cue.strengths" :key="index">
                {{ item }}
              </li>
            </ul>
            <p v-if="!question.answer.cue.strengths.length" class="history-muted">暂无记录</p>
          </div>
          <div>
            <h3>改进方向</h3>
            <ul>
              <li v-for="(item, index) in question.answer.cue.gaps" :key="index">{{ item }}</li>
            </ul>
            <p v-if="!question.answer.cue.gaps.length" class="history-muted">暂无记录</p>
          </div>
        </div>
        <p class="review-next-action">
          <strong>下一步：</strong>{{ question.answer.cue.nextAction }}
        </p>
        <details class="review-evidence" open>
          <summary>评分依据 · {{ question.answer.cue.evidence.length }} 条证据</summary>
          <blockquote v-for="(evidence, index) in question.answer.cue.evidence" :key="index">
            <small>{{ sourceLabels[evidence.source] }}</small>
            <p>{{ evidence.quote }}</p>
          </blockquote>
        </details>
      </template>
      <p v-else class="history-muted">这条历史回答没有保存反馈。</p>
    </template>
    <p v-else class="history-muted">本题尚未作答，可返回训练继续。</p>
  </article>
</template>
