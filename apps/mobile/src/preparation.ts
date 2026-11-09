import { computed, onScopeDispose, reactive, ref } from 'vue';
import { defineStore } from 'pinia';
import type {
  Difficulty,
  InterviewLanguage,
  InterviewRound,
  JobAnalysis,
  JobRecord,
  StoryInput,
} from '@interview-assistant/contracts';
import { address, api, message } from './connection';

const recoveryKey = JSON.stringify(['interview.mobile.preparation.v1', address]);
const pollIntervalMs = 2000;
const maxResumeBytes = 10 * 1024 * 1024;

type Recovery = { profileId: string; jobId: string };

function readRecovery(): Recovery {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(recoveryKey) ?? '{}');
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
      throw new Error('Invalid preparation recovery');
    const saved = parsed as Record<string, unknown>;
    const validId = (value: unknown) =>
      typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value) ? value : '';
    return { profileId: validId(saved.profileId), jobId: validId(saved.jobId) };
  } catch {
    try {
      localStorage.removeItem(recoveryKey);
    } catch {
      // Storage can be unavailable in private WebViews.
    }
    return { profileId: '', jobId: '' };
  }
}

function saveRecovery(value: Recovery) {
  try {
    if (value.profileId || value.jobId) localStorage.setItem(recoveryKey, JSON.stringify(value));
    else localStorage.removeItem(recoveryKey);
  } catch {
    // Server-side recovery is optional when browser storage is unavailable.
  }
}

function emptyStory(): StoryInput {
  return { title: '', project: '', situation: '', task: '', action: '', result: '', metrics: [] };
}

export const usePreparation = defineStore('preparation', () => {
  const profileId = ref('');
  const job = ref<JobRecord | null>(null);
  const loading = ref(false);
  const error = ref('');
  const recoveryPending = ref(false);
  const uploadError = ref('');
  const uploadProgress = ref(0);
  const resumeFileName = ref('');
  const resumeDocument = ref<{ extractedChars: number } | null>(null);
  const analysisStatus = computed(() => job.value?.analysisStatus ?? 'pending');
  const analysis = computed<JobAnalysis | null>(() => job.value?.analysis ?? null);
  const form = reactive({
    displayName: '',
    resumeText: '',
    targetRole: 'AI Frontend Engineer',
    company: '',
    jobDescription: '',
    language: 'zh-CN' as InterviewLanguage,
    round: 'technical' as InterviewRound,
    difficulty: 'l2' as Difficulty,
    questionCount: 8,
    feedbackPolicy: 'immediate' as 'immediate' | 'deferred',
    timeLimitMinutes: 0,
  });
  const stories = ref<StoryInput[]>([]);
  const storyDraft = reactive<StoryInput>(emptyStory());
  const storyMetrics = ref('');
  let active = false;
  let generation = 0;
  let poll: ReturnType<typeof setTimeout> | undefined;
  const submittedStories = new Map<string, Set<string>>();

  function storyKey(story: StoryInput) {
    return JSON.stringify(story);
  }

  function current(ticket: number) {
    return active && ticket === generation;
  }
  function clearPoll() {
    if (poll) clearTimeout(poll);
    poll = undefined;
  }
  function applyJob(value: JobRecord) {
    job.value = value;
    profileId.value = value.profileId;
    form.targetRole = value.targetRole;
    form.company = value.company ?? '';
    form.jobDescription = value.description;
    saveRecovery({ profileId: value.profileId, jobId: value.id });
    error.value = value.analysisStatus === 'failed' ? (value.analysisError ?? '岗位分析失败') : '';
  }
  function schedulePoll(delay = pollIntervalMs) {
    if (
      !active ||
      loading.value ||
      poll ||
      !job.value ||
      !['pending', 'processing'].includes(job.value.analysisStatus)
    )
      return;
    const ticket = generation;
    const id = job.value.id;
    poll = setTimeout(async () => {
      poll = undefined;
      try {
        const next = await api.getJob(id);
        if (current(ticket) && job.value?.id === id) applyJob(next);
      } catch (cause) {
        if (current(ticket) && job.value?.id === id) error.value = message(cause);
      } finally {
        schedulePoll();
      }
    }, delay);
  }
  async function restore() {
    const ticket = generation;
    const saved = readRecovery();
    if (!saved.jobId) return;
    loading.value = true;
    error.value = '';
    try {
      const restored = await api.getJob(saved.jobId);
      if (current(ticket)) {
        applyJob(restored);
        recoveryPending.value = false;
        schedulePoll(0);
      }
    } catch (cause) {
      if (current(ticket)) {
        if (saved.profileId) profileId.value = saved.profileId;
        recoveryPending.value = true;
        error.value = `无法恢复上次岗位分析：${message(cause)}`;
      }
    } finally {
      if (current(ticket)) {
        loading.value = false;
        schedulePoll(0);
      }
    }
  }
  async function activate() {
    if (active) return;
    active = true;
    generation++;
    await restore();
  }
  async function retryRecovery() {
    if (!active || loading.value) return;
    await restore();
  }
  function deactivate() {
    active = false;
    generation++;
    clearPoll();
    loading.value = false;
  }
  async function upload(file: File) {
    if (loading.value) return;
    const extension = file.name.toLowerCase().split('.').pop();
    if (extension !== 'pdf' && extension !== 'docx') {
      uploadError.value =
        extension === 'doc' ? '请将旧版 DOC 保存为 PDF 或 DOCX' : '仅支持 PDF 或 DOCX';
      return;
    }
    if (file.size > maxResumeBytes) {
      uploadError.value = '简历文件不能超过 10 MB';
      return;
    }
    const ticket = generation;
    loading.value = true;
    uploadError.value = error.value = '';
    uploadProgress.value = 0;
    try {
      const response = await api.uploadResume(file, form.displayName, (progress) => {
        if (current(ticket)) uploadProgress.value = progress;
      });
      if (!current(ticket)) return;
      profileId.value = response.id;
      submittedStories.delete(response.id);
      form.resumeText = response.resumeText;
      resumeFileName.value = file.name;
      resumeDocument.value = response.resumeDocument
        ? { extractedChars: response.resumeDocument.extractedChars }
        : null;
      uploadProgress.value = 100;
      saveRecovery({ profileId: response.id, jobId: '' });
    } catch (cause) {
      if (current(ticket)) {
        profileId.value = '';
        saveRecovery({ profileId: '', jobId: '' });
        uploadError.value = message(cause);
      }
    } finally {
      if (current(ticket)) loading.value = false;
    }
  }
  function addStory() {
    const fields = [
      storyDraft.title,
      storyDraft.project,
      storyDraft.situation,
      storyDraft.task,
      storyDraft.action,
      storyDraft.result,
    ];
    if (fields.some((field) => !field.trim())) return false;
    stories.value.push({
      ...storyDraft,
      metrics: storyMetrics.value
        .split(/[，,;；\n]/)
        .map((value) => value.trim())
        .filter(Boolean),
    });
    Object.assign(storyDraft, emptyStory());
    storyMetrics.value = '';
    return true;
  }
  function editResume(value: string) {
    form.resumeText = value;
    profileId.value = '';
    submittedStories.clear();
    resumeFileName.value = '';
    resumeDocument.value = null;
    saveRecovery({ profileId: '', jobId: '' });
  }
  async function analyze() {
    if (
      loading.value ||
      recoveryPending.value ||
      !form.targetRole.trim() ||
      form.jobDescription.trim().length < 20 ||
      (!profileId.value && form.resumeText.trim().length < 20)
    )
      return;
    const ticket = ++generation;
    const snapshot = {
      profileId: profileId.value,
      resumeText: form.resumeText,
      displayName: form.displayName,
      targetRole: form.targetRole,
      company: form.company,
      jobDescription: form.jobDescription,
      stories: stories.value.map((story) => ({ ...story, metrics: [...story.metrics] })),
    };
    clearPoll();
    loading.value = true;
    error.value = '';
    recoveryPending.value = false;
    job.value = null;
    try {
      if (!snapshot.profileId) {
        const profile = await api.createProfile({
          resumeText: snapshot.resumeText,
          ...(snapshot.displayName.trim() ? { displayName: snapshot.displayName } : {}),
        });
        if (!current(ticket)) return;
        profileId.value = profile.id;
        snapshot.profileId = profile.id;
        saveRecovery({ profileId: profile.id, jobId: '' });
      }
      const sent = submittedStories.get(snapshot.profileId) ?? new Set<string>();
      submittedStories.set(snapshot.profileId, sent);
      for (const story of snapshot.stories) {
        const key = storyKey(story);
        if (sent.has(key)) continue;
        await api.createStory(snapshot.profileId, story);
        if (!current(ticket)) return;
        sent.add(key);
      }
      const result = await api.analyzeJob({
        profileId: snapshot.profileId,
        targetRole: snapshot.targetRole,
        ...(snapshot.company.trim() ? { company: snapshot.company } : {}),
        jobDescription: snapshot.jobDescription,
      });
      if (!current(ticket)) return;
      applyJob(result);
    } catch (cause) {
      if (current(ticket)) error.value = message(cause);
    } finally {
      if (current(ticket)) {
        loading.value = false;
        schedulePoll();
      }
    }
  }
  async function start() {
    if (loading.value || job.value?.analysisStatus !== 'completed' || !profileId.value) return;
    loading.value = true;
    error.value = '';
    const ticket = generation;
    try {
      const response = await api.createInterviewSession({
        profileId: profileId.value,
        jobId: job.value.id,
        language: form.language,
        round: form.round,
        difficulty: form.difficulty,
        questionCount: form.questionCount,
        ...(form.feedbackPolicy === 'deferred' ? { feedbackPolicy: form.feedbackPolicy } : {}),
        ...(form.timeLimitMinutes ? { timeLimitMinutes: form.timeLimitMinutes } : {}),
      });
      if (current(ticket)) return response.id;
    } catch (cause) {
      if (current(ticket)) error.value = message(cause);
    } finally {
      if (current(ticket)) loading.value = false;
    }
  }
  function reset() {
    generation++;
    clearPoll();
    loading.value = false;
    error.value = '';
    recoveryPending.value = false;
    uploadError.value = '';
    uploadProgress.value = 0;
    profileId.value = '';
    submittedStories.clear();
    job.value = null;
    resumeFileName.value = '';
    resumeDocument.value = null;
    form.displayName = '';
    form.resumeText = '';
    form.targetRole = 'AI Frontend Engineer';
    form.company = '';
    form.jobDescription = '';
    form.language = 'zh-CN';
    form.round = 'technical';
    form.difficulty = 'l2';
    form.questionCount = 8;
    form.feedbackPolicy = 'immediate';
    form.timeLimitMinutes = 0;
    stories.value = [];
    Object.assign(storyDraft, emptyStory());
    storyMetrics.value = '';
    saveRecovery({ profileId: '', jobId: '' });
  }
  onScopeDispose(deactivate);

  return {
    profileId,
    job,
    loading,
    error,
    recoveryPending,
    uploadError,
    uploadProgress,
    resumeFileName,
    resumeDocument,
    analysisStatus,
    analysis,
    form,
    stories,
    storyDraft,
    storyMetrics,
    activate,
    deactivate,
    retryRecovery,
    upload,
    addStory,
    editResume,
    analyze,
    start,
    reset,
  };
});
