<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { usePreparation } from '../preparation';

const router = useRouter();
const setup = usePreparation();
const fileInput = ref<HTMLInputElement>();
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
  <h1>准备训练</h1>
  <p v-if="setup.error" role="alert">{{ setup.error }}</p>
  <button v-if="setup.recoveryPending" :disabled="setup.loading" @click="setup.retryRecovery">
    重试恢复上次分析
  </button>
  <p v-if="setup.uploadError" role="alert">{{ setup.uploadError }}</p>

  <template v-if="!setup.job">
    <fieldset :disabled="setup.loading || setup.recoveryPending">
      <section class="panel">
        <h2>候选人档案</h2>
        <label for="display-name">称呼</label>
        <input id="display-name" v-model="setup.form.displayName" placeholder="可选" />
        <div class="file-row">
          <button :disabled="setup.loading" @click="selectFile">
            {{ setup.resumeFileName ? '更换简历' : '上传 PDF 或 DOCX' }}
          </button>
          <small>最大 10 MB</small>
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
        <p v-if="setup.resumeFileName" role="status">
          {{ setup.resumeFileName
          }}<template v-if="setup.resumeDocument">
            · 已解析 {{ setup.resumeDocument.extractedChars }} 字</template
          >
        </p>
        <label for="resume-text">简历文本</label>
        <textarea
          id="resume-text"
          :value="setup.form.resumeText"
          rows="9"
          placeholder="也可以粘贴简历文本。请包含真实项目、技术决策和结果。"
          :disabled="setup.loading && setup.uploadProgress > 0"
          @input="setup.editResume(($event.target as HTMLTextAreaElement).value)"
        ></textarea>
        <small>简历至少 20 个字符后可分析</small>
      </section>

      <section class="panel">
        <h2>目标岗位</h2>
        <label for="role">岗位名称</label>
        <input id="role" v-model="setup.form.targetRole" />
        <label for="company">公司</label>
        <input id="company" v-model="setup.form.company" placeholder="可选" />
        <label for="job-description">岗位描述</label>
        <textarea
          id="job-description"
          v-model="setup.form.jobDescription"
          rows="8"
          placeholder="粘贴目标岗位职责和要求"
        ></textarea>
        <small>岗位描述至少 20 个字符</small>
      </section>

      <section class="panel">
        <div class="section-heading">
          <h2>STAR 经历</h2>
          <span>{{ setup.stories.length }} 条</span>
        </div>
        <details>
          <summary>添加真实项目经历</summary>
          <label for="story-title">故事标题</label
          ><input id="story-title" v-model="setup.storyDraft.title" />
          <label for="story-project">项目名称</label
          ><input id="story-project" v-model="setup.storyDraft.project" />
          <label for="story-situation">Situation</label
          ><textarea id="story-situation" v-model="setup.storyDraft.situation" rows="2"></textarea>
          <label for="story-task">Task</label
          ><textarea id="story-task" v-model="setup.storyDraft.task" rows="2"></textarea>
          <label for="story-action">Action</label
          ><textarea id="story-action" v-model="setup.storyDraft.action" rows="3"></textarea>
          <label for="story-result">Result</label
          ><textarea id="story-result" v-model="setup.storyDraft.result" rows="2"></textarea>
          <label for="story-metrics">量化结果</label
          ><input
            id="story-metrics"
            v-model="setup.storyMetrics"
            placeholder="使用逗号分隔，可选"
          />
          <button
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
            加入故事库
          </button>
        </details>
        <article v-for="(story, index) in setup.stories" :key="story.title" class="story-item">
          <strong>{{ story.title }}</strong
          ><span>{{ story.project }}</span
          ><button class="quiet" @click="setup.stories.splice(index, 1)">移除</button>
        </article>
      </section>
      <button class="primary" :disabled="setup.loading || !canAnalyze" @click="setup.analyze">
        {{ setup.loading ? '正在准备…' : '分析岗位' }}
      </button>
    </fieldset>
  </template>

  <template v-else>
    <fieldset :disabled="setup.loading">
      <section class="panel analysis-panel">
        <div class="section-heading">
          <div>
            <small>岗位分析</small>
            <h2>{{ setup.analysis?.summary ?? (analyzing ? '正在分析岗位' : '岗位分析失败') }}</h2>
          </div>
          <button v-if="!analyzing" class="quiet" :disabled="setup.loading" @click="setup.analyze">
            重新分析
          </button>
        </div>
        <p v-if="analyzing" role="status">分析完成后可开始模拟面试</p>
        <template v-else-if="setup.analysis">
          <article
            v-for="item in setup.analysis.competencies"
            :key="item.competency"
            class="analysis-item"
          >
            <div class="section-heading">
              <strong>{{ item.competency }}</strong
              ><small>{{
                item.priority === 'high'
                  ? '优先准备'
                  : item.priority === 'medium'
                    ? '重点准备'
                    : '建议准备'
              }}</small>
            </div>
            <p>{{ item.summary }}</p>
            <ul>
              <li v-for="focus in item.focusAreas" :key="focus">{{ focus }}</li>
            </ul>
            <blockquote v-for="(evidence, index) in item.evidence" :key="index">
              {{ evidence.quote }}
            </blockquote>
          </article>
          <h3>可能涉及的问题</h3>
          <ul>
            <li v-for="item in setup.analysis.likelyQuestions" :key="item">{{ item }}</li>
          </ul>
          <p v-if="setup.analysis.missingEvidence.length">
            <strong>待补充事实</strong>：{{ setup.analysis.missingEvidence.join('；') }}
          </p>
        </template>
      </section>
      <section v-if="setup.job.analysisStatus === 'completed'" class="panel">
        <h2>面试设置</h2>
        <label for="feedback-policy">反馈方式</label>
        <select id="feedback-policy" v-model="setup.form.feedbackPolicy">
          <option value="immediate">逐题辅导</option>
          <option value="deferred">完整模拟，结束后反馈</option>
        </select>
        <label for="time-limit">时间</label>
        <select id="time-limit" v-model.number="setup.form.timeLimitMinutes">
          <option :value="0">不限时</option>
          <option v-for="n in [15, 30, 45, 60]" :key="n" :value="n">{{ n }} 分钟</option>
        </select>
        <label for="question-count">题数</label>
        <select id="question-count" v-model.number="setup.form.questionCount">
          <option :value="4">短场 · 4 题</option>
          <option :value="8">标准场 · 8 题</option>
        </select>
        <label for="language">面试语言</label>
        <select id="language" v-model="setup.form.language">
          <option value="zh-CN">中文</option>
          <option value="en-US">English</option>
          <option value="mixed">中英混合</option>
        </select>
        <label for="round">面试轮次</label>
        <select id="round" v-model="setup.form.round">
          <option value="screening">初筛</option>
          <option value="technical">技术面</option>
          <option value="system-design">系统设计</option>
          <option value="behavioral">行为面</option>
        </select>
        <label for="difficulty">面试难度</label>
        <select id="difficulty" v-model="setup.form.difficulty">
          <option value="l1">L1 基础</option>
          <option value="l2">L2 进阶</option>
          <option value="l3">L3 挑战</option>
        </select>
        <button class="primary" :disabled="setup.loading" @click="start">
          {{ setup.loading ? '正在生成题目…' : '开始面试' }}
        </button>
      </section>
    </fieldset>
  </template>
</template>

<style scoped>
.file-row,
.section-heading,
.story-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.file-row {
  margin: 12px 0;
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}
label {
  margin-top: 14px;
}
select {
  width: 100%;
  min-height: 44px;
  padding: 9px;
  margin: 4px 0 8px;
  border: 1px solid #84998e;
  border-radius: 6px;
  background: white;
  font: inherit;
}
article {
  padding: 12px 0;
  border-top: 1px solid var(--line);
}
.analysis-item p {
  margin: 6px 0;
}
.story-item {
  justify-content: flex-start;
}
.story-item button {
  margin-left: auto;
}
details {
  margin: 10px 0;
}
details[open] summary {
  margin-bottom: 12px;
}
</style>
