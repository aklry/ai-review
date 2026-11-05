<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useDashboardStore } from '../stores/dashboard.js';
import { useTrainingStore } from '../stores/training.js';
import {
  formatInterviewDate,
  languageLabels,
  roundLabels,
  statusLabels,
} from '../lib/interview-labels.js';

const dashboard = useDashboardStore();
const router = useRouter();

function startTraining(): void {
  useTrainingStore().restart();
  void router.push('/training');
}

onMounted(() => void dashboard.load());
onBeforeUnmount(dashboard.cancel);
</script>

<template>
  <section class="view dashboard-view" :aria-busy="dashboard.loading">
    <header class="view-header dashboard-header">
      <div>
        <p class="eyebrow">前端 + AI · 面试准备</p>
        <h1>把下一次面试，练得更有把握</h1>
        <p class="dashboard-intro">从目标岗位出发，在练习和复盘中，把经历讲清楚，把技术讲深入。</p>
      </div>
    </header>

    <div v-if="dashboard.error" class="dashboard-error" role="alert">
      <div>
        <strong>暂时无法读取训练记录</strong>
        <p>请稍后重试，已有训练会保留。</p>
      </div>
      <el-button :loading="dashboard.loading" @click="dashboard.load">重新加载</el-button>
    </div>

    <div class="dashboard-top-grid">
      <section class="dashboard-focus" aria-labelledby="focus-title">
        <template v-if="dashboard.loading">
          <p class="section-label">你的下一步</p>
          <h2 id="focus-title">正在读取训练进度…</h2>
          <el-skeleton :rows="3" animated />
        </template>
        <template v-else-if="dashboard.resumeSession">
          <p class="section-label">接着上次，继续向前</p>
          <div class="dashboard-focus-heading">
            <h2 id="focus-title">{{ dashboard.resumeSession.targetRole }}</h2>
            <el-tag effect="plain">{{ statusLabels[dashboard.resumeSession.status] }}</el-tag>
          </div>
          <p class="dashboard-focus-copy">
            {{ dashboard.resumeSession.company || '自定义岗位' }} ·
            {{ roundLabels[dashboard.resumeSession.round] }} ·
            {{ languageLabels[dashboard.resumeSession.language] }}
          </p>
          <div class="dashboard-progress">
            <span>已回答主问题</span>
            <strong
              >{{ dashboard.resumeSession.answeredMainQuestionCount }} /
              {{ dashboard.resumeSession.mainQuestionCount }}</strong
            >
          </div>
          <p class="dashboard-focus-hint">
            {{
              dashboard.resumeSession.status === 'awaiting_finish'
                ? '回答已完成，生成报告后看看哪些地方还可以改进。'
                : '回到这场面试，继续回答问题和追问。'
            }}
          </p>
          <div class="dashboard-actions">
            <RouterLink
              :to="{ path: '/training', query: { sessionId: dashboard.resumeSession.id } }"
              class="dashboard-primary-link"
            >
              {{
                dashboard.resumeSession.status === 'awaiting_finish' ? '前往生成报告' : '继续训练'
              }}
              <span aria-hidden="true">→</span>
            </RouterLink>
            <el-button text @click="startTraining">新建训练</el-button>
          </div>
        </template>
        <template v-else>
          <p class="section-label">你的下一步</p>
          <h2 id="focus-title">
            {{ dashboard.isEmpty ? '从一场模拟面试开始' : '准备好，再练一场' }}
          </h2>
          <p class="dashboard-focus-copy">
            上传简历，填入目标岗位，让面试问题贴近你的经历与求职方向。
          </p>
          <div class="dashboard-topic-tags" aria-label="训练覆盖方向">
            <span>项目深挖</span><span>系统设计</span><span>AI 应用</span><span>Vue / React</span>
          </div>
          <div class="dashboard-actions">
            <el-button type="primary" size="large" @click="startTraining">
              {{ dashboard.isEmpty ? '开始首次训练' : '新建训练' }}
              <span class="dashboard-button-arrow" aria-hidden="true">→</span>
            </el-button>
            <span class="dashboard-action-note">文字模拟 · 逐题反馈</span>
          </div>
        </template>
      </section>

      <aside class="dashboard-review" aria-labelledby="review-title">
        <p class="section-label">练习之后</p>
        <h2 id="review-title">让反馈变成下一次的进步</h2>
        <el-skeleton v-if="dashboard.loading" :rows="3" animated />
        <template v-else-if="dashboard.latestCompleted">
          <p class="dashboard-review-caption">最近完成的训练</p>
          <h3>{{ dashboard.latestCompleted.targetRole }}</h3>
          <p class="dashboard-review-date">
            {{ formatInterviewDate(dashboard.latestCompleted.startedAt) }}
          </p>
          <p class="dashboard-review-copy">回看原始回答与逐题反馈，找出一个值得改进的地方。</p>
          <RouterLink
            :to="`/history/${encodeURIComponent(dashboard.latestCompleted.id)}`"
            class="history-link"
            >查看这次复盘 <span aria-hidden="true">→</span></RouterLink
          >
        </template>
        <template v-else>
          <p class="dashboard-review-copy">
            {{
              dashboard.error
                ? '在历史训练中查看回答与反馈，整理下一次练习的重点。'
                : '完成训练后，在这里回到最近一次复盘，查看回答中的亮点与待补充之处。'
            }}
          </p>
          <ul class="dashboard-review-benefits">
            <li>对照原始回答，理解评分依据</li>
            <li>参考示范答案，完善表达结构</li>
            <li>结合训练计划，安排后续准备</li>
          </ul>
          <RouterLink v-if="dashboard.error" to="/history" class="history-link"
            >前往历史训练 →</RouterLink
          >
        </template>
      </aside>
    </div>

    <section class="dashboard-recent" aria-labelledby="recent-title">
      <div class="dashboard-section-heading">
        <div>
          <h2 id="recent-title">最近训练</h2>
          <p>继续未完成的面试，或回顾每一次回答。</p>
        </div>
        <RouterLink to="/history" class="history-link"
          >查看全部 <span aria-hidden="true">→</span></RouterLink
        >
      </div>
      <el-skeleton v-if="dashboard.loading" class="dashboard-list-skeleton" :rows="4" animated />
      <p v-else-if="dashboard.error" class="dashboard-list-message">训练记录暂未加载，请重试。</p>
      <div v-else-if="dashboard.isEmpty" class="dashboard-first-run">
        <div class="dashboard-empty-heading">
          <strong>还没有训练记录</strong><span>准备一份简历和目标岗位，按这三步完成首次训练。</span>
        </div>
        <ol class="dashboard-steps">
          <li>
            <span aria-hidden="true">01</span>
            <div>
              <h3>准备简历与岗位</h3>
              <p>上传 PDF / DOCX 简历，填写岗位描述。</p>
            </div>
          </li>
          <li>
            <span aria-hidden="true">02</span>
            <div>
              <h3>完成模拟问答</h3>
              <p>结合真实经历回答问题，查看逐题反馈。</p>
            </div>
          </li>
          <li>
            <span aria-hidden="true">03</span>
            <div>
              <h3>复盘并改进</h3>
              <p>查看报告与参考答案，明确后续准备重点。</p>
            </div>
          </li>
        </ol>
      </div>
      <div v-else class="dashboard-session-list">
        <article v-for="item in dashboard.recentSessions" :key="item.id" class="dashboard-session">
          <div class="dashboard-session-info">
            <h3>{{ item.targetRole }}</h3>
            <p>
              {{ item.company || '自定义岗位' }} · {{ roundLabels[item.round] }} ·
              {{ formatInterviewDate(item.startedAt) }}
            </p>
          </div>
          <div class="dashboard-session-progress">
            <el-tag
              :type="
                item.status === 'completed'
                  ? 'success'
                  : item.status === 'active'
                    ? 'primary'
                    : 'warning'
              "
              effect="light"
              >{{ statusLabels[item.status] }}</el-tag
            >
            <span
              >已答 {{ item.answeredMainQuestionCount }} /
              {{ item.mainQuestionCount }} 道主问题</span
            >
          </div>
          <RouterLink
            :to="
              item.status === 'completed'
                ? `/history/${encodeURIComponent(item.id)}`
                : { path: '/training', query: { sessionId: item.id } }
            "
            class="history-link dashboard-session-link"
            :aria-label="`${item.targetRole}：${item.status === 'completed' ? '查看复盘' : item.status === 'awaiting_finish' ? '前往生成报告' : '继续训练'}`"
          >
            {{
              item.status === 'completed'
                ? '查看复盘'
                : item.status === 'awaiting_finish'
                  ? '生成报告'
                  : '继续训练'
            }}
            <span aria-hidden="true">→</span>
          </RouterLink>
        </article>
      </div>
    </section>
  </section>
</template>

<style scoped>
.dashboard-header {
  margin-bottom: 28px;
}
.dashboard-header h1 {
  font-size: clamp(24px, 2.5vw, 30px);
}
.dashboard-intro {
  margin: 12px 0 0;
  color: #687887;
  font-size: 14px;
  line-height: 1.8;
}
.dashboard-top-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr);
  gap: 22px;
}
.dashboard-focus,
.dashboard-review {
  padding: 30px;
  border-radius: 12px;
}
.dashboard-focus {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  border: 1px solid #ccdef1;
  background: #edf4fc;
}
.dashboard-focus .section-label {
  color: #3c6b9b;
  margin-bottom: 18px;
}
.dashboard-focus h2 {
  font-size: 25px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.dashboard-focus-heading {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.dashboard-focus-copy {
  margin: 12px 0 20px;
  color: #50677d;
  font-size: 14px;
  line-height: 1.9;
  overflow-wrap: anywhere;
}
.dashboard-topic-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 28px;
}
.dashboard-topic-tags span {
  padding: 5px 10px;
  border: 1px solid #d6e3f0;
  border-radius: 5px;
  font-size: 12px;
  color: #50677d;
  background: #f7faff;
}
.dashboard-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: auto;
  padding-top: 12px;
}
.dashboard-actions .el-button {
  margin-left: 0;
}
.dashboard-primary-link {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 32px;
  min-height: 40px;
  padding: 10px 20px;
  border-radius: 5px;
  background: #1565c0;
  color: #fff;
  text-decoration: none;
  font-size: 14px;
}
.dashboard-primary-link:hover {
  background: #0d54a6;
}
.dashboard-view a:focus-visible {
  outline: 3px solid #1565c0;
  outline-offset: 4px;
}
.dashboard-button-arrow {
  margin-left: 24px;
}
.dashboard-action-note,
.dashboard-focus-hint {
  font-size: 12px;
  line-height: 1.8;
  color: #50677d;
}
.dashboard-progress {
  display: flex;
  gap: 18px;
  align-items: center;
  font-size: 13px;
  color: #50677d;
}
.dashboard-progress strong {
  color: #1c4d80;
  font-size: 20px;
}
.dashboard-focus-hint {
  margin: 10px 0;
}
.dashboard-review {
  background: #fff;
  border: 1px solid #e1e8ee;
}
.dashboard-review h2 {
  font-size: 18px;
  line-height: 1.6;
}
.dashboard-review h3 {
  margin: 8px 0;
  font-size: 16px;
  overflow-wrap: anywhere;
}
.dashboard-review-caption {
  margin: 20px 0 0;
  color: #687887;
  font-size: 12px;
}
.dashboard-review-date {
  color: #687887;
  font-size: 12px;
}
.dashboard-review-copy {
  margin: 16px 0;
  color: #687887;
  font-size: 13px;
  line-height: 1.9;
}
.dashboard-review-benefits {
  margin: 0;
  padding-left: 18px;
  color: #50677d;
  font-size: 13px;
  line-height: 2.2;
}
.dashboard-recent {
  margin-top: 34px;
}
.dashboard-section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
}
.dashboard-section-heading h2 {
  font-size: 19px;
}
.dashboard-section-heading p {
  margin: 8px 0 0;
  color: #687887;
  font-size: 13px;
  line-height: 1.6;
}
.dashboard-section-heading > a {
  flex-shrink: 0;
}
.dashboard-session-list,
.dashboard-first-run {
  background: #fff;
  border: 1px solid #e1e8ee;
  border-radius: 10px;
}
.dashboard-session {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 24px;
  padding: 22px 24px;
}
.dashboard-session + .dashboard-session {
  border-top: 1px solid #edf0f3;
}
.dashboard-session h3 {
  margin: 0 0 8px;
  font-size: 15px;
  overflow-wrap: anywhere;
}
.dashboard-session p {
  margin: 0;
  font-size: 12px;
  line-height: 1.8;
  color: #687887;
  overflow-wrap: anywhere;
}
.dashboard-session-progress {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}
.dashboard-session-progress > span:last-child {
  color: #687887;
  font-size: 12px;
}
.dashboard-session-link {
  white-space: nowrap;
}
.dashboard-first-run {
  padding: 24px;
}
.dashboard-empty-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.dashboard-empty-heading strong {
  font-size: 14px;
}
.dashboard-empty-heading > span {
  font-size: 13px;
  color: #687887;
  line-height: 1.8;
}
.dashboard-steps {
  list-style: none;
  padding: 0;
  margin: 26px 0 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 24px;
}
.dashboard-steps li {
  display: flex;
  gap: 12px;
}
.dashboard-steps li > span {
  color: #47749f;
  font-size: 12px;
  font-weight: 700;
  padding-top: 3px;
}
.dashboard-steps h3 {
  font-size: 14px;
  margin: 0 0 8px;
}
.dashboard-steps p {
  font-size: 12px;
  color: #687887;
  line-height: 1.8;
  margin: 0;
}
.dashboard-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 16px 20px;
  margin-bottom: 20px;
  border: 1px solid #ecd6af;
  background: #fffbf2;
  border-radius: 8px;
  font-size: 14px;
}
.dashboard-error p {
  margin: 6px 0 0;
  color: #687887;
  font-size: 13px;
}
.dashboard-list-message,
.dashboard-list-skeleton {
  padding: 24px;
  color: #687887;
  font-size: 14px;
}
.dashboard-view .el-skeleton {
  margin-top: 20px;
}
@media (max-width: 1100px) {
  .dashboard-top-grid {
    grid-template-columns: 1fr;
  }
  .dashboard-steps {
    grid-template-columns: 1fr;
    gap: 18px;
  }
}
@media (max-width: 700px) {
  .dashboard-focus,
  .dashboard-review {
    padding: 22px;
  }
  .dashboard-session {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 16px;
    padding: 20px;
  }
  .dashboard-session-info {
    grid-column: 1 / -1;
  }
  .dashboard-section-heading,
  .dashboard-error {
    align-items: flex-start;
    flex-direction: column;
    gap: 12px;
  }
}
</style>
