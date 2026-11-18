<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { usePreparation } from '../preparation';

const router = useRouter();
const setup = usePreparation();
const fileInput = ref<HTMLInputElement>();
const preparing = ref(false);
const canAnalyze = computed(() =>
  Boolean(
    setup.form.targetRole.trim() &&
    setup.form.jobDescription.trim().length >= 20 &&
    (setup.profileId || setup.form.resumeText.trim().length >= 20),
  ),
);
const analyzing = computed(() => ['pending', 'processing'].includes(setup.analysisStatus));

function selectFile() {
  fileInput.value?.click();
}
async function changedFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) await setup.upload(file);
}
async function analyze() {
  if (setup.loading || preparing.value) return;
  preparing.value = true;
  try {
    await setup.analyze();
  } finally {
    preparing.value = false;
  }
}
async function start() {
  const id = await setup.start();
  if (id) await router.push('/training/' + encodeURIComponent(id));
}
onMounted(() => void setup.activate());
onBeforeUnmount(() => setup.deactivate());
</script>

<template>
  <header>
    <router-link to="/">‹ 面试训练</router-link>
    <button class="quiet" :disabled="setup.loading" @click="setup.reset">重新准备</button>
  </header>

  <div class="setup-hero-banner">
    <div class="setup-hero-icon">🎯</div>
    <div class="setup-hero-text">
      <h1>准备模拟面试</h1>
      <p>由 AI 面试 Agent 深度解析岗位要求，自动构建高拟真考察链路。</p>
    </div>
  </div>

  <p v-if="setup.error" role="alert">{{ setup.error }}</p>
  <button
    v-if="setup.recoveryPending"
    class="recovery-btn"
    :disabled="setup.loading"
    @click="setup.retryRecovery"
  >
    重试恢复上次分析
  </button>
  <p v-if="setup.uploadError" role="alert">{{ setup.uploadError }}</p>

  <!-- 阶段 1：录入背景与分析 -->
  <template v-if="!setup.job">
    <fieldset :disabled="setup.loading || setup.recoveryPending">
      <!-- 目标岗位卡片 -->
      <section class="panel setup-section">
        <div class="section-title-row">
          <span class="step-badge">1</span>
          <h2>目标求职岗位</h2>
        </div>
        <label for="role">岗位名称</label>
        <input
          id="role"
          v-model="setup.form.targetRole"
          placeholder="例如：前端架构师、资深全栈工程师"
        />

        <label for="company">目标公司 (可选)</label>
        <input
          id="company"
          v-model="setup.form.company"
          placeholder="例如：字节跳动、腾讯、某创业公司"
        />

        <div class="label-with-hint">
          <label for="job-description">岗位描述与任职要求</label>
          <span class="char-hint" :class="{ ok: setup.form.jobDescription.trim().length >= 20 }">
            {{ setup.form.jobDescription.trim().length }}/20 字起
          </span>
        </div>
        <textarea
          id="job-description"
          v-model="setup.form.jobDescription"
          rows="6"
          placeholder="直接粘贴目标岗位的职责、任职要求、技术栈等内容…"
        ></textarea>
        <small class="field-tip">岗位描述越详实，AI 面试官生成的考察点与场景追问越真实深入。</small>
      </section>

      <!-- 候选人档案卡片 -->
      <section class="panel setup-section">
        <div class="section-title-row">
          <span class="step-badge">2</span>
          <h2>个人背景与简历</h2>
        </div>
        <label for="display-name">如何称呼你 (可选)</label>
        <input
          id="display-name"
          v-model="setup.form.displayName"
          placeholder="例如：Alex、李同学"
        />

        <div class="upload-box" @click="selectFile">
          <div class="upload-icon-circle">📄</div>
          <div class="upload-info">
            <strong>{{ setup.resumeFileName ? '更换简历文件' : '上传 PDF 或 DOCX 简历' }}</strong>
            <small>支持 PDF、Word 文档，最大 10 MB</small>
          </div>
          <button type="button" class="upload-trigger-btn" :disabled="setup.loading">
            {{ setup.resumeFileName ? '重新上传' : '选择文件' }}
          </button>
          <input
            ref="fileInput"
            class="visually-hidden"
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            @change="changedFile"
          />
        </div>

        <progress
          v-if="setup.loading && setup.uploadProgress"
          :value="setup.uploadProgress"
          max="100"
        ></progress>
        <div v-if="setup.resumeFileName" class="uploaded-pill" role="status">
          <span class="file-check">✓</span>
          <span class="file-name">{{ setup.resumeFileName }}</span>
          <span v-if="setup.resumeDocument" class="file-chars"
            >已解析 {{ setup.resumeDocument.extractedChars }} 字</span
          >
        </div>

        <div class="label-with-hint">
          <label for="resume-text">简历纯文本内容</label>
          <span class="char-hint" :class="{ ok: setup.form.resumeText.trim().length >= 20 }">
            {{ setup.form.resumeText.trim().length }}/20 字起
          </span>
        </div>
        <textarea
          id="resume-text"
          :value="setup.form.resumeText"
          rows="7"
          placeholder="也可以直接粘贴简历文本，包含真实项目亮点、架构选型与成果…"
          :disabled="setup.loading && setup.uploadProgress > 0"
          @input="setup.editResume(($event.target as HTMLTextAreaElement).value)"
        ></textarea>
        <small class="field-tip"
          >简历文本至少 20 字符，支持 AI 面试官就真实经历展开针对性深挖。</small
        >
      </section>

      <!-- STAR 故事库卡片 -->
      <section class="panel setup-section">
        <div class="section-heading">
          <div class="section-title-row">
            <span class="step-badge">3</span>
            <h2>STAR 经历库 (可选)</h2>
          </div>
          <span class="count-badge">{{ setup.stories.length }} 条</span>
        </div>
        <p class="muted">提前准备结构化项目案例，AI 将在相关考点精准检验你的回答完整度。</p>

        <details class="star-disclosure">
          <summary>＋ 添加项目故事</summary>
          <div class="star-form">
            <label for="story-title">故事主题</label>
            <input
              id="story-title"
              v-model="setup.storyDraft.title"
              placeholder="例如：高并发架构重构"
            />

            <label for="story-project">项目名称</label>
            <input
              id="story-project"
              v-model="setup.storyDraft.project"
              placeholder="例如：核心交易网关优化"
            />

            <label for="story-situation">Situation (背景)</label>
            <textarea
              id="story-situation"
              v-model="setup.storyDraft.situation"
              rows="2"
              placeholder="当时面临怎样的业务挑战？"
            ></textarea>

            <label for="story-task">Task (目标任务)</label>
            <textarea
              id="story-task"
              v-model="setup.storyDraft.task"
              rows="2"
              placeholder="你承担的核心职责和指标是什么？"
            ></textarea>

            <label for="story-action">Action (行动)</label>
            <textarea
              id="story-action"
              v-model="setup.storyDraft.action"
              rows="3"
              placeholder="你采取了哪些关键技术手段和设计决策？"
            ></textarea>

            <label for="story-result">Result (结果)</label>
            <textarea
              id="story-result"
              v-model="setup.storyDraft.result"
              rows="2"
              placeholder="取得了怎样的量化业务收益？"
            ></textarea>

            <label for="story-metrics">量化指标 (逗号分隔)</label>
            <input
              id="story-metrics"
              v-model="setup.storyMetrics"
              placeholder="例如：延迟降低 40%, QPS 提升 3 倍"
            />
            <button
              class="add-story-btn"
              :disabled="
                !setup.storyDraft.title.trim() ||
                !setup.storyDraft.project.trim() ||
                !setup.storyDraft.situation.trim() ||
                !setup.storyDraft.task.trim() ||
                !setup.storyDraft.action.trim() ||
                !setup.storyDraft.result.trim()
              "
              @click="setup.addStory"
            >
              保存至故事库
            </button>
          </div>
        </details>

        <div v-if="setup.stories.length" class="stories-list">
          <article v-for="(story, index) in setup.stories" :key="story.title" class="story-item">
            <div class="story-info">
              <strong>{{ story.title }}</strong>
              <small>{{ story.project }}</small>
            </div>
            <button class="quiet remove-story-btn" @click="setup.stories.splice(index, 1)">
              移除
            </button>
          </article>
        </div>
      </section>

      <!-- 启动岗位分析按钮 -->
      <button
        class="primary analyze-btn"
        :disabled="setup.loading || !canAnalyze"
        :aria-busy="preparing"
        @click="analyze"
      >
        <span v-if="preparing" class="loading-spinner" aria-hidden="true"></span>
        {{ preparing ? '正在准备分析…' : 'AI 深度分析岗位与定制考点 ›' }}
      </button>
    </fieldset>
  </template>

  <!-- 阶段 2：岗位分析完成，配置面试参数并开始 -->
  <template v-else>
    <fieldset :disabled="setup.loading">
      <!-- 岗位分析面板 -->
      <section class="panel analysis-panel" :aria-busy="analyzing">
        <div class="section-heading">
          <div>
            <span class="ai-agent-pill">
              <span class="ai-pulse-dot"></span>
              岗位深度画像
            </span>
            <h2 class="analysis-title">
              {{
                setup.analysis?.summary ?? (analyzing ? '正在深度分析岗位要求…' : '岗位分析失败')
              }}
            </h2>
          </div>
          <button
            v-if="!analyzing"
            class="quiet reanalyze-btn"
            :disabled="setup.loading"
            @click="analyze"
          >
            重新分析
          </button>
        </div>

        <template v-if="analyzing">
          <p class="loading-status" role="status">
            <span class="loading-spinner" aria-hidden="true"></span>
            AI 正在提炼核心考点与追问维度，完成后自动呈现…
          </p>
          <div class="analysis-skeleton" aria-hidden="true">
            <span v-for="line in 8" :key="line"></span>
          </div>
        </template>

        <template v-else-if="setup.analysis">
          <div class="competencies-card-list">
            <article
              v-for="item in setup.analysis.competencies"
              :key="item.competency"
              class="analysis-item"
              :class="item.priority"
            >
              <div class="section-heading">
                <strong class="item-name">{{ item.competency }}</strong>
                <span class="priority-chip" :class="item.priority">
                  {{
                    item.priority === 'high'
                      ? '高优考查'
                      : item.priority === 'medium'
                        ? '重点考察'
                        : '建议准备'
                  }}
                </span>
              </div>
              <p class="item-summary">{{ item.summary }}</p>
              <div v-if="item.focusAreas.length" class="focus-tags">
                <span v-for="focus in item.focusAreas" :key="focus" class="focus-chip">{{
                  focus
                }}</span>
              </div>
              <blockquote v-for="(evidence, index) in item.evidence" :key="index">
                {{ evidence.quote }}
              </blockquote>
            </article>
          </div>

          <div v-if="setup.analysis.likelyQuestions.length" class="likely-questions-box">
            <h3>✦ AI 预测的高频必问问题</h3>
            <ul>
              <li v-for="item in setup.analysis.likelyQuestions" :key="item">{{ item }}</li>
            </ul>
          </div>

          <p v-if="setup.analysis.missingEvidence.length" class="missing-facts-tip">
            <strong>建议补充的背景证据</strong>：{{ setup.analysis.missingEvidence.join('；') }}
          </p>
        </template>
      </section>

      <!-- 面试参数设置面板 -->
      <section v-if="setup.job.analysisStatus === 'completed'" class="panel settings-panel">
        <div class="section-heading">
          <h2>面试模式与考场设置</h2>
          <span class="sub-hint">定制你的考察流程</span>
        </div>

        <div class="settings-form-grid">
          <div class="setting-field">
            <label for="feedback-policy">反馈模式</label>
            <select id="feedback-policy" v-model="setup.form.feedbackPolicy">
              <option value="immediate">逐题辅导 (答完即出考官点评)</option>
              <option value="deferred">完整模拟 (全场结束后统一出报告)</option>
            </select>
          </div>

          <div class="setting-field">
            <label for="round">面试轮次</label>
            <select id="round" v-model="setup.form.round">
              <option value="screening">初筛面</option>
              <option value="technical">技术专业面</option>
              <option value="system-design">系统设计面</option>
              <option value="behavioral">HR / 行为面</option>
            </select>
          </div>

          <div class="setting-field">
            <label for="difficulty">面试难度</label>
            <select id="difficulty" v-model="setup.form.difficulty">
              <option value="l1">L1 基础标准</option>
              <option value="l2">L2 进阶实战</option>
              <option value="l3">L3 架构挑战</option>
            </select>
          </div>

          <div class="setting-field">
            <label for="language">面试语言</label>
            <select id="language" v-model="setup.form.language">
              <option value="zh-CN">中文沟通</option>
              <option value="en-US">全英文作答 (English)</option>
              <option value="mixed">中英混合面试</option>
            </select>
          </div>

          <div class="setting-field">
            <label for="question-count">考题数量</label>
            <select id="question-count" v-model.number="setup.form.questionCount">
              <option :value="4">精炼速练 · 4 题</option>
              <option :value="8">全真模考 · 8 题</option>
            </select>
          </div>

          <div class="setting-field">
            <label for="time-limit">时间限制</label>
            <select id="time-limit" v-model.number="setup.form.timeLimitMinutes">
              <option :value="0">不限时作答</option>
              <option v-for="n in [15, 30, 45, 60]" :key="n" :value="n">{{ n }} 分钟限制</option>
            </select>
          </div>
        </div>

        <button
          class="primary start-btn"
          :disabled="setup.loading"
          :aria-busy="setup.loading"
          @click="start"
        >
          <span v-if="setup.loading" class="loading-spinner" aria-hidden="true"></span>
          {{ setup.loading ? 'AI 正在组卷与生成题目…' : '开始 AI 模拟面试 ›' }}
        </button>
      </section>
    </fieldset>
  </template>
</template>

<style scoped>
.setup-hero-banner {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 20px;
  margin-bottom: 16px;
  border-radius: var(--radius-lg);
  background: var(--surface);
  border: 1px solid var(--card-border);
  box-shadow: var(--shadow-sm);
}

.setup-hero-icon {
  font-size: 32px;
}

.setup-hero-text h1 {
  font-size: 20px;
  margin: 0 0 4px;
  font-weight: 800;
}

.setup-hero-text p {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
}

.recovery-btn {
  margin-bottom: 12px;
}

.setup-section {
  padding: 22px;
}

.section-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.step-badge {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--accent-gradient);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 800;
}

.section-title-row h2 {
  font-size: 17px;
  margin: 0;
}

.label-with-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 14px;
}

.label-with-hint label {
  margin: 0;
}

.char-hint {
  font-size: 12px;
  color: var(--muted-light);
  font-variant-numeric: tabular-nums;
}

.char-hint.ok {
  color: var(--accent);
  font-weight: 600;
}

.field-tip {
  display: block;
  font-size: 12px;
  color: var(--muted);
  margin-top: 6px;
}

/* 上传区域现代化 */
.upload-box {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  margin: 12px 0 8px;
  border: 1.5px dashed var(--line-strong);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--ink) 2%, var(--surface));
  cursor: pointer;
  transition: all 180ms var(--ease);
}

.upload-box:active {
  background: var(--accent-soft);
  border-color: var(--accent);
}

.upload-icon-circle {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}

.upload-info {
  flex: 1;
}

.upload-info strong {
  display: block;
  font-size: 14px;
  color: var(--ink);
}

.upload-info small {
  color: var(--muted);
  font-size: 12px;
}

.upload-trigger-btn {
  min-height: 34px;
  padding: 4px 12px;
  font-size: 13px;
  border-radius: 999px;
  background: var(--surface);
}

.uploaded-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--status-met-bg);
  color: var(--status-met);
  font-size: 12.5px;
  font-weight: 600;
  margin-bottom: 8px;
}

.file-check {
  font-weight: 800;
}

.file-chars {
  font-weight: normal;
  opacity: 0.85;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

/* STAR 折叠表单 */
.count-badge {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 650;
  background: var(--accent-soft);
  color: var(--accent);
}

.star-disclosure {
  margin: 12px 0;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  padding: 10px 14px;
}

.star-disclosure summary {
  color: var(--accent);
  font-weight: 700;
}

.star-form {
  padding-top: 10px;
}

.add-story-btn {
  margin-top: 12px;
  width: 100%;
}

.stories-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.story-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--ink) 3%, var(--surface));
  border: 1px solid var(--line);
}

.story-info strong {
  display: block;
  font-size: 14px;
}

.story-info small {
  color: var(--muted);
}

.analyze-btn {
  min-height: 50px;
  font-size: 16px;
  margin-top: 14px;
}

/* 岗位分析结果 */
.analysis-panel {
  padding: 22px;
}

.analysis-title {
  font-size: 18px;
  margin: 6px 0 0;
}

.competencies-card-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 14px;
}

.analysis-item {
  padding: 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--line);
  background: color-mix(in srgb, var(--ink) 2%, var(--surface));
}

.analysis-item.high {
  border-left: 3.5px solid var(--accent);
}

.analysis-item.medium {
  border-left: 3.5px solid var(--status-warn);
}

.item-name {
  font-size: 15px;
  color: var(--ink);
}

.priority-chip {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 700;
}

.priority-chip.high {
  background: var(--status-met-bg);
  color: var(--status-met);
}

.priority-chip.medium {
  background: var(--status-warn-bg);
  color: var(--status-warn);
}

.priority-chip.low {
  background: color-mix(in srgb, var(--ink) 6%, var(--surface));
  color: var(--muted);
}

.item-summary {
  font-size: 13.5px;
  color: var(--ink-secondary);
  margin: 6px 0 8px;
  line-height: 1.5;
}

.focus-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.focus-chip {
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 11.5px;
  color: var(--accent);
  background: var(--accent-soft);
}

.likely-questions-box {
  margin-top: 16px;
  padding: 14px;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--accent) 5%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--accent) 15%, transparent);
}

.likely-questions-box h3 {
  font-size: 14px;
  color: var(--accent);
  margin: 0 0 8px;
}

.likely-questions-box ul {
  margin: 0;
  padding-left: 18px;
}

.likely-questions-box li {
  margin-bottom: 5px;
  font-size: 13.5px;
  line-height: 1.5;
}

.missing-facts-tip {
  font-size: 13px;
  color: var(--muted);
  margin-top: 12px;
}

/* 参数设置网格 */
.settings-panel {
  padding: 22px;
}

.settings-form-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  margin-top: 12px;
}

@media (min-width: 480px) {
  .settings-form-grid {
    grid-template-columns: 1fr 1fr;
  }
}

.setting-field label {
  margin: 0 0 6px;
  font-size: 13px;
}

.setting-field select {
  margin: 0;
}

.start-btn {
  margin-top: 20px;
  min-height: 52px;
  font-size: 16px;
}
</style>
