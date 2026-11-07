<script setup lang="ts">
import type { SessionReview } from '@interview-assistant/contracts';
import { competencyLabels, sourceLabels } from '../lib/interview-labels.js';
import RubricFeedback from './RubricFeedback.vue';
import VoiceAnswer from './VoiceAnswer.vue';
import ReferenceAnswer from './ReferenceAnswer.vue';
import { ref } from 'vue';
import { request } from '../lib/http.js';
const reason = ref(''),
  notice = ref(''),
  sending = ref(false);
async function dispute() {
  if (!reason.value.trim() || sending.value) return;
  sending.value = true;
  try {
    await request({
      method: 'POST',
      url: '/questions/' + encodeURIComponent(props.question.id) + '/score-dispute',
      data: { reason: reason.value },
    });
    notice.value = '已记录，待人工复核';
  } catch (e) {
    notice.value = e instanceof Error ? e.message : '提交失败';
  } finally {
    sending.value = false;
  }
}
const props = defineProps<{
  question: SessionReview['questions'][number];
  label: string;
  activePractice?: boolean;
}>();
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
      <el-tag v-else type="info">{{
        question.skippedAt ? '已跳过' : question.answer ? '暂无评分' : '未作答'
      }}</el-tag>
    </div>
    <VoiceAnswer :key="question.id" :question-id="question.id" readonly />
    <template v-if="question.answer">
      <p class="section-label">我的回答</p>
      <p class="review-answer">{{ question.answer.answerText }}</p>
      <template v-if="question.answer.cue">
        <RubricFeedback
          v-if="question.answer.cue.rubricEvaluation"
          :evaluation="question.answer.cue.rubricEvaluation"
          :snapshot="question.rubricSnapshot"
        />
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
        <details>
          <summary>对此评分有异议</summary>
          <p v-if="question.dispute">已提交：{{ question.dispute }}</p>
          <el-input
            v-model="reason"
            maxlength="1000"
            placeholder="指出评分项、原文和分歧"
          /><el-button :disabled="sending || !reason.trim()" @click="dispute"
            >保存复核意见</el-button
          ><span role="status">{{ notice }}</span>
        </details>
        <ReferenceAnswer
          v-if="question.answer.cue.referenceAnswer"
          :answer="question.answer.cue.referenceAnswer"
          :track-question-id="activePractice ? question.id : undefined"
        />
        <p v-else class="history-muted">这条历史反馈未保存参考答案。</p>
      </template>
      <p v-else class="history-muted">暂无可展示的反馈。</p>
    </template>
    <p v-else class="history-muted">
      {{ question.skippedAt ? '本题已跳过，不参与评分。' : '本题未作答。' }}
    </p>
  </article>
</template>
