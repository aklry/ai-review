<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from 'vue';
import { storeToRefs } from 'pinia';
import {
  analyzeJob,
  createInterviewSession,
  createProfile,
  createStory,
  finishInterviewSession,
  getJob,
  submitAnswer,
  uploadResume,
} from '../api/interview.js';
import { ApiClientError } from '../lib/http.js';
import { useTrainingStore, type Phase } from '../stores/training.js';

const resumeFileInput = ref<HTMLInputElement | null>(null);

const trainingStore = useTrainingStore();
const {
  phase,
  loading,
  errorMessage,
  profileId,
  jobId,
  sessionId,
  profileName,
  resumeText,
  resumeFileName,
  resumeUploadState,
  resumeUploadProgress,
  resumeDocument,
  manualResumeMode,
  targetRole,
  company,
  jobDescription,
  interviewLanguage,
  interviewRound,
  interviewDifficulty,
  questionCount,
  stories,
  storyDraft,
  storyMetricsText,
  currentQuestion,
  currentQuestionIndex,
  answerText,
  latestCue,
  analysis,
  analysisStatus,
  analysisError,
  analysisJobId,
  report,
  modelState,
  session,
} = storeToRefs(trainingStore);

const analysisPollingIntervalMs = 2000;
let analysisPollHandle: number | null = null;

const canStartPreparation = computed(
  () =>
    Boolean(profileId.value) || (manualResumeMode.value && resumeText.value.trim().length >= 20),
);

const phaseTitle = computed(() => {
  const titles: Record<Phase, string> = {
    setup: '准备训练',
    analysis: '岗位分析',
    interview: '文字模拟',
    report: '训练报告',
  };
  return titles[phase.value];
});

const progress = computed(() => {
  if (!session.value?.questions.length) return 0;
  return Math.min(
    100,
    Math.round((currentQuestionIndex.value / session.value.questions.length) * 100),
  );
});

const analysisIsLoading = computed(
  () => analysisStatus.value === 'pending' || analysisStatus.value === 'processing',
);

async function startPreparation(): Promise<void> {
  stopAnalysisPolling();
  errorMessage.value = '';
  loading.value = true;
  analysisError.value = null;
  analysis.value = null;
  try {
    let activeProfileId = profileId.value;
    if (!activeProfileId) {
      const profile = await createProfile({
        resumeText: resumeText.value,
        ...(profileName.value.trim() ? { displayName: profileName.value } : {}),
      });
      activeProfileId = profile.id;
      profileId.value = profile.id;
    }
    for (const story of stories.value) {
      await createStory(activeProfileId, story);
    }
    const job = await analyzeJob({
      profileId: activeProfileId,
      targetRole: targetRole.value,
      ...(company.value.trim() ? { company: company.value } : {}),
      jobDescription: jobDescription.value,
    });
    jobId.value = job.id;
    analysisJobId.value = job.id;
    analysisStatus.value = job.analysisStatus;
    analysisError.value = job.analysisError;
    if (job.analysisStatus === 'completed' && job.analysis) {
      analysis.value = job.analysis;
      phase.value = 'analysis';
      return;
    }
    phase.value = 'analysis';
    startAnalysisPolling();
  } catch (error) {
    showError(error);
  } finally {
    loading.value = false;
  }
}

function openResumePicker(): void {
  resumeFileInput.value?.click();
}

function handleResumeFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) {
    void uploadResumeFile(file);
  }
}

async function uploadResumeFile(file: File): Promise<void> {
  profileId.value = '';
  resumeText.value = '';
  resumeFileName.value = '';
  resumeDocument.value = null;
  resumeUploadProgress.value = 0;
  manualResumeMode.value = false;

  const extension = file.name.toLowerCase().split('.').pop();
  if (extension === 'doc') {
    resumeUploadState.value = 'error';
    errorMessage.value = '暂不支持旧版 DOC 文件，请另存为 DOCX 或 PDF 后重新上传';
    return;
  }
  if (extension !== 'pdf' && extension !== 'docx') {
    resumeUploadState.value = 'error';
    errorMessage.value = '仅支持 PDF 或 DOCX 简历文件';
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    resumeUploadState.value = 'error';
    errorMessage.value = '简历文件不能超过 10 MB';
    return;
  }

  errorMessage.value = '';
  loading.value = true;
  resumeUploadState.value = 'uploading';
  resumeUploadProgress.value = 0;
  try {
    const profile = await uploadResume(file, profileName.value, (percentage) => {
      resumeUploadProgress.value = percentage;
    });
    profileId.value = profile.id;
    resumeText.value = profile.resumeText;
    resumeFileName.value = file.name;
    resumeDocument.value = profile.resumeDocument ?? null;
    manualResumeMode.value = false;
    resumeUploadState.value = 'ready';
    resumeUploadProgress.value = 100;
  } catch (error) {
    resumeUploadState.value = 'error';
    showError(error);
  } finally {
    loading.value = false;
  }
}

function enableManualResume(): void {
  manualResumeMode.value = true;
  profileId.value = '';
  resumeText.value = '';
  resumeFileName.value = '';
  resumeUploadProgress.value = 0;
  resumeUploadState.value = 'idle';
  resumeDocument.value = null;
}

function toggleManualResume(): void {
  if (manualResumeMode.value) {
    manualResumeMode.value = false;
    resumeText.value = '';
    return;
  }
  enableManualResume();
}

function clearResumeUpload(): void {
  profileId.value = '';
  resumeText.value = '';
  resumeFileName.value = '';
  resumeDocument.value = null;
  resumeUploadProgress.value = 0;
  resumeUploadState.value = 'idle';
}

async function startInterview(): Promise<void> {
  if (!profileId.value || !jobId.value) return;
  errorMessage.value = '';
  loading.value = true;
  try {
    const created = await createInterviewSession({
      profileId: profileId.value,
      jobId: jobId.value,
      language: interviewLanguage.value,
      round: interviewRound.value,
      difficulty: interviewDifficulty.value,
      questionCount: questionCount.value,
    });
    session.value = created;
    sessionId.value = created.id;
    currentQuestionIndex.value = 0;
    currentQuestion.value = created.questions[0] ?? null;
    latestCue.value = null;
    answerText.value = '';
    modelState.value = null;
    phase.value = 'interview';
  } catch (error) {
    showError(error);
  } finally {
    loading.value = false;
  }
}

async function sendAnswer(): Promise<void> {
  if (!sessionId.value || !currentQuestion.value || !answerText.value.trim()) return;
  errorMessage.value = '';
  loading.value = true;
  try {
    const result = await submitAnswer(sessionId.value, {
      questionId: currentQuestion.value.id,
      answerText: answerText.value,
    });
    latestCue.value = result.cue;
    modelState.value = { model: result.model, degraded: result.degraded };
    answerText.value = '';
    if (result.nextQuestion) {
      currentQuestionIndex.value += 1;
      currentQuestion.value = result.nextQuestion;
    }
  } catch (error) {
    showError(error);
  } finally {
    loading.value = false;
  }
}

async function finishInterview(): Promise<void> {
  if (!sessionId.value) return;
  errorMessage.value = '';
  loading.value = true;
  try {
    report.value = await finishInterviewSession(sessionId.value);
    phase.value = 'report';
  } catch (error) {
    showError(error);
  } finally {
    loading.value = false;
  }
}

function restart(): void {
  stopAnalysisPolling();
  trainingStore.restart();
}

function startAnalysisPolling(): void {
  stopAnalysisPolling();
  void pollAnalysisOnce();
  analysisPollHandle = window.setInterval(() => {
    void pollAnalysisOnce();
  }, analysisPollingIntervalMs);
}

function stopAnalysisPolling(): void {
  if (analysisPollHandle !== null) {
    window.clearInterval(analysisPollHandle);
    analysisPollHandle = null;
  }
}

async function pollAnalysisOnce(): Promise<void> {
  if (
    !analysisJobId.value ||
    analysisStatus.value === 'completed' ||
    analysisStatus.value === 'failed'
  ) {
    stopAnalysisPolling();
    return;
  }

  try {
    const job = await getJob(analysisJobId.value);
    analysisStatus.value = job.analysisStatus;
    analysisError.value = job.analysisError;
    if (job.analysisStatus === 'completed' && job.analysis) {
      analysis.value = job.analysis;
      stopAnalysisPolling();
    }
    if (job.analysisStatus === 'failed') {
      stopAnalysisPolling();
      errorMessage.value = job.analysisError ?? '岗位分析失败';
    }
  } catch (error) {
    showError(error);
    stopAnalysisPolling();
  }
}

onBeforeUnmount(() => {
  stopAnalysisPolling();
});

function addStoryDraft(): void {
  const draft = storyDraft.value;
  if (
    !draft.title.trim() ||
    !draft.project.trim() ||
    !draft.situation.trim() ||
    !draft.task.trim() ||
    !draft.action.trim() ||
    !draft.result.trim()
  ) {
    return;
  }

  stories.value = [
    ...stories.value,
    {
      ...draft,
      metrics: storyMetricsText.value
        .split(/[，,;；\n]/)
        .map((item) => item.trim())
        .filter(Boolean),
    },
  ];

  storyDraft.value = {
    title: '',
    project: '',
    situation: '',
    task: '',
    action: '',
    result: '',
    metrics: [],
  };
  storyMetricsText.value = '';
}

function showError(error: unknown): void {
  errorMessage.value =
    error instanceof ApiClientError
      ? error.message
      : '请求失败，请检查 API、PostgreSQL 和 DeepSeek 配置';
}
</script>

<template>
  <section class="view training-view">
    <header class="view-header">
      <div>
        <p class="eyebrow">DEEPSEEK · POSTGRESQL</p>
        <h1>{{ phaseTitle }}</h1>
      </div>
      <div class="flow-status">
        <el-tag :type="phase === 'report' ? 'success' : 'info'" effect="plain">
          {{
            phase === 'setup'
              ? '未开始'
              : phase === 'analysis'
                ? '已完成分析'
                : phase === 'interview'
                  ? '进行中'
                  : '已完成'
          }}
        </el-tag>
        <el-button v-if="phase !== 'setup'" text @click="restart">重新开始</el-button>
      </div>
    </header>

    <el-alert
      v-if="errorMessage"
      class="api-alert"
      type="error"
      :closable="false"
      show-icon
      :title="errorMessage"
    />

    <template v-if="phase === 'setup'">
      <div class="setup-grid">
        <section class="form-panel">
          <p class="section-label">候选人档案</p>
          <el-form label-position="top">
            <el-form-item label="称呼">
              <el-input v-model="profileName" placeholder="可选" />
            </el-form-item>
            <el-form-item label="简历文件">
              <div class="resume-file-row">
                <el-button
                  type="primary"
                  :loading="resumeUploadState === 'uploading'"
                  :disabled="loading && resumeUploadState !== 'uploading'"
                  @click="openResumePicker"
                >
                  {{ resumeUploadState === 'ready' ? '更换简历文件' : '选择简历文件' }}
                </el-button>
                <input
                  ref="resumeFileInput"
                  class="resume-file-input"
                  type="file"
                  accept=".pdf,.doc,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  @change="handleResumeFileChange"
                />
                <span class="resume-file-hint">支持 PDF、DOCX，单个文件最大 10 MB</span>
              </div>
              <div v-if="resumeUploadState === 'uploading'" class="resume-upload-status">
                <span>正在上传并解析 {{ resumeUploadProgress }}%</span>
                <el-progress
                  :percentage="resumeUploadProgress"
                  :show-text="false"
                  :stroke-width="6"
                />
              </div>
              <div v-else-if="resumeUploadState === 'ready'" class="resume-ready-status">
                <div class="resume-ready-head">
                  <div>
                    <strong>{{ resumeFileName }}</strong>
                    <small>
                      已解析
                      <template v-if="resumeDocument">
                        · {{ resumeDocument.extractedChars }} 字
                      </template>
                    </small>
                  </div>
                  <el-button text @click="clearResumeUpload">清除</el-button>
                </div>
                <p>{{ resumeText.slice(0, 360) }}{{ resumeText.length > 360 ? '…' : '' }}</p>
              </div>
              <el-input
                v-if="manualResumeMode"
                v-model="resumeText"
                class="manual-resume-input"
                type="textarea"
                :rows="10"
                placeholder="粘贴简历文本，包含你真实负责的项目、技术决策和结果。"
              />
              <div class="resume-mode-actions">
                <span>{{
                  manualResumeMode
                    ? '手动文本会在分析前创建候选人档案。'
                    : '文件解析后会自动创建候选人档案。'
                }}</span>
                <el-button text @click="toggleManualResume">
                  {{ manualResumeMode ? '返回文件上传' : '手动粘贴文本' }}
                </el-button>
              </div>
            </el-form-item>
          </el-form>
        </section>

        <section class="form-panel">
          <p class="section-label">目标岗位</p>
          <el-form label-position="top">
            <el-form-item label="岗位名称">
              <el-input v-model="targetRole" />
            </el-form-item>
            <el-form-item label="公司">
              <el-input v-model="company" placeholder="可选" />
            </el-form-item>
            <el-form-item label="职位描述">
              <el-input
                v-model="jobDescription"
                type="textarea"
                :rows="10"
                placeholder="粘贴目标岗位 JD，建议包含职责、技能和经验要求。"
              />
            </el-form-item>
          </el-form>
        </section>
      </div>
      <section class="story-panel">
        <div class="section-heading">
          <div>
            <p class="section-label">STAR 故事库</p>
            <h2>补充可引用的真实经历</h2>
          </div>
          <el-tag effect="plain">{{ stories.length }} 条</el-tag>
        </div>
        <div class="story-form-grid">
          <el-input v-model="storyDraft.title" placeholder="故事标题" />
          <el-input v-model="storyDraft.project" placeholder="项目名称" />
          <el-input v-model="storyDraft.situation" placeholder="Situation" />
          <el-input v-model="storyDraft.task" placeholder="Task" />
          <el-input v-model="storyDraft.action" placeholder="Action" />
          <el-input v-model="storyDraft.result" placeholder="Result" />
        </div>
        <el-input
          v-model="storyMetricsText"
          class="story-metrics"
          placeholder="量化指标，使用逗号分隔"
        />
        <div class="form-actions">
          <span>这些故事会在岗位分析和追问中作为可引用证据。</span>
          <el-button :disabled="!storyDraft.title.trim()" @click="addStoryDraft"
            >加入故事库</el-button
          >
        </div>
        <div v-if="stories.length" class="story-list">
          <article v-for="story in stories" :key="story.title" class="story-item">
            <strong>{{ story.title }}</strong>
            <span>{{ story.project }}</span>
            <small>{{ story.result }}</small>
          </article>
        </div>
      </section>
      <div class="form-actions">
        <span>数据将由服务端调用 DeepSeek 分析，API Key 不会进入桌面端。</span>
        <el-button
          type="primary"
          :loading="loading"
          :disabled="!canStartPreparation || jobDescription.trim().length < 20"
          @click="startPreparation"
        >
          分析岗位并继续
        </el-button>
      </div>
    </template>

    <template v-else-if="phase === 'analysis'">
      <section class="analysis-panel">
        <div class="section-heading">
          <div>
            <p class="section-label">JOB AGENT</p>
            <h2 v-if="analysis?.summary">{{ analysis.summary }}</h2>
            <h2 v-else-if="analysisIsLoading">正在分析岗位</h2>
            <h2 v-else>岗位分析失败</h2>
          </div>
          <el-tag type="success" effect="light">证据化分析</el-tag>
        </div>
        <template v-if="analysisIsLoading">
          <el-skeleton :rows="8" animated />
          <p class="analysis-status-hint">岗位分析正在生成，完成后会自动刷新。</p>
        </template>

        <template v-else-if="analysis">
          <div class="analysis-grid">
            <article
              v-for="item in analysis.competencies"
              :key="item.competency"
              class="analysis-item"
            >
              <div class="analysis-item-head">
                <strong>{{ item.competency }}</strong>
                <el-tag size="small" :type="item.priority === 'high' ? 'danger' : 'warning'">
                  {{ item.priority }}
                </el-tag>
              </div>
              <p>{{ item.summary }}</p>
              <div class="tag-row">
                <el-tag v-for="focus in item.focusAreas" :key="focus" size="small" effect="plain">
                  {{ focus }}
                </el-tag>
              </div>
              <small>证据：{{ item.evidence[0]?.quote }}</small>
            </article>
          </div>
          <div class="question-preview">
            <p class="section-label">高频考点</p>
            <ul>
              <li v-for="question in analysis.likelyQuestions" :key="question">{{ question }}</li>
            </ul>
          </div>
          <div class="form-actions">
            <span>{{
              analysis.missingEvidence.length
                ? `待补充事实：${analysis.missingEvidence.join('；')}`
                : '已识别关键事实，可开始受控模拟。'
            }}</span>
            <div class="action-group">
              <el-select v-model="interviewLanguage" aria-label="面试语言">
                <el-option label="中文" value="zh-CN" />
                <el-option label="English" value="en-US" />
                <el-option label="中英混合" value="mixed" />
              </el-select>
              <el-select v-model="interviewRound" aria-label="面试轮次">
                <el-option label="技术面" value="technical" />
                <el-option label="系统设计" value="system-design" />
                <el-option label="行为面" value="behavioral" />
              </el-select>
              <el-select v-model="interviewDifficulty" aria-label="面试难度">
                <el-option label="L1 基础" value="l1" />
                <el-option label="L2 进阶" value="l2" />
                <el-option label="L3 挑战" value="l3" />
              </el-select>
              <el-button
                type="primary"
                :loading="loading"
                :disabled="!analysis"
                @click="startInterview"
              >
                开始文字模拟
              </el-button>
            </div>
          </div>
        </template>

        <template v-else>
          <el-empty description="岗位分析失败" :image-size="96">
            <el-button type="primary" @click="startPreparation">重新分析岗位</el-button>
          </el-empty>
        </template>
      </section>
    </template>

    <template v-else-if="phase === 'interview'">
      <section class="interview-layout">
        <div class="interview-main">
          <div class="progress-row">
            <span>第 {{ currentQuestionIndex + 1 }} 题</span>
            <span>{{ session?.questions.length ?? questionCount }} 题计划</span>
          </div>
          <el-progress :percentage="progress" :show-text="false" :stroke-width="7" />
          <div class="question-panel">
            <div class="question-meta">
              <el-tag size="small">{{ currentQuestion?.competency }}</el-tag>
              <el-tag size="small" effect="plain">{{ currentQuestion?.difficulty }}</el-tag>
              <span v-if="currentQuestion?.isCore">核心题</span>
            </div>
            <h2>{{ currentQuestion?.prompt }}</h2>
          </div>
          <el-input
            v-model="answerText"
            type="textarea"
            :rows="12"
            resize="none"
            placeholder="基于真实经历作答。可以使用 STAR 结构，并补充技术取舍与量化结果。"
          />
          <div class="form-actions">
            <span>这是受控训练模式，不生成真实面试中的实时作答内容。</span>
            <div class="action-group">
              <el-button :loading="loading" :disabled="!answerText.trim()" @click="sendAnswer">
                提交回答
              </el-button>
              <el-button type="primary" :loading="loading" @click="finishInterview">
                结束并生成报告
              </el-button>
            </div>
          </div>
        </div>

        <aside class="feedback-panel">
          <div class="section-heading">
            <div>
              <p class="section-label">COACH AGENT</p>
              <h2>即时反馈</h2>
            </div>
            <el-tag
              v-if="modelState"
              size="small"
              :type="modelState.degraded ? 'warning' : 'success'"
            >
              {{ modelState.degraded ? 'Fallback' : 'Primary' }}
            </el-tag>
          </div>
          <template v-if="latestCue">
            <div class="score-ring">{{ latestCue.score }}<small>/5</small></div>
            <p class="feedback-action">{{ latestCue.nextAction }}</p>
            <div class="feedback-section">
              <strong>做得好</strong>
              <ul>
                <li v-for="item in latestCue.strengths" :key="item">{{ item }}</li>
              </ul>
            </div>
            <div class="feedback-section">
              <strong>待加强</strong>
              <ul>
                <li v-for="item in latestCue.gaps" :key="item">{{ item }}</li>
              </ul>
            </div>
            <div class="evidence">
              <strong>证据</strong>
              <p>“{{ latestCue.evidence[0]?.quote }}”</p>
            </div>
            <small v-if="modelState">{{ modelState.model }}</small>
          </template>
          <el-empty v-else description="提交第一题后查看反馈" :image-size="72" />
        </aside>
      </section>
    </template>

    <template v-else>
      <section v-if="report" class="report-layout">
        <div class="report-score-panel">
          <p class="section-label">SESSION SCORE</p>
          <div class="overall-score">{{ Math.round(report.overallScore) }}<small>/100</small></div>
          <p>{{ report.summary }}</p>
        </div>
        <div class="report-main">
          <div class="section-heading">
            <div>
              <p class="section-label">COMPETENCY TREND</p>
              <h2>四维训练结果</h2>
            </div>
          </div>
          <div class="score-grid">
            <article
              v-for="(score, competency) in report.competencyScores"
              :key="competency"
              class="score-item"
            >
              <span>{{ competency }}</span>
              <strong>{{ score }}/5</strong>
              <el-progress :percentage="score * 20" :show-text="false" :stroke-width="6" />
            </article>
          </div>
          <div class="report-columns">
            <div>
              <p class="section-label">优势</p>
              <ul>
                <li v-for="item in report.strengths" :key="item">{{ item }}</li>
              </ul>
            </div>
            <div>
              <p class="section-label">训练重点</p>
              <ul>
                <li v-for="item in report.gaps" :key="item">{{ item }}</li>
              </ul>
            </div>
          </div>
          <div class="plan-list">
            <p class="section-label">7 天训练计划</p>
            <article v-for="item in report.nextPlan" :key="item.day" class="plan-item">
              <strong>Day {{ item.day }}</strong>
              <span>{{ item.task }}</span>
              <small>{{ item.reason }}</small>
            </article>
          </div>
        </div>
      </section>
    </template>
  </section>
</template>
