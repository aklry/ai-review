import { computed, ref, shallowRef } from 'vue';
import { defineStore } from 'pinia';
import {
  coachingCueSchema,
  type CoachingCue,
  type InterviewQuestion,
} from '@interview-assistant/contracts';
import type { SessionRecord } from '@interview-assistant/api-client';
import { address, api, message } from './connection';

export const useSession = defineStore('session', () => {
  const session = shallowRef<SessionRecord | null>(null);
  const question = computed(() =>
    session.value?.questions.find((q) => q.id === session.value?.activeQuestionId),
  );
  const draft = ref('');
  const feedback = shallowRef<CoachingCue | null>(null);
  const feedbackQuestion = shallowRef<InterviewQuestion | null>(null);
  const busy = ref(false);
  const needsSync = ref(true);
  const error = ref('');
  const storageError = ref('');
  let selected = '';
  let generation = 0;
  const pendingWrites = new Map<string, Promise<void>>();

  function draftKey(questionId: string) {
    return JSON.stringify(['interview.mobile.draft', address, selected, questionId]);
  }
  function edit(value: string) {
    draft.value = value;
    if (!question.value) return;
    try {
      if (value) localStorage.setItem(draftKey(question.value.id), value);
      else localStorage.removeItem(draftKey(question.value.id));
      storageError.value = '';
    } catch {
      storageError.value = '本机无法保存草稿，请保持此页面打开。';
    }
  }
  function appendTranscript(value: string) {
    const text = value.trim();
    if (text) edit([draft.value.trim(), text].filter(Boolean).join('\n'));
  }
  function apply(next: SessionRecord) {
    const previous = question.value?.id;
    const previousQuestion = session.value?.questions.find((item) => item.id === previous);
    const savedPreviousQuestion = next.questions.find((item) => item.id === previous);
    let previousCue: CoachingCue | null = null;
    if (
      savedPreviousQuestion &&
      typeof savedPreviousQuestion.answer === 'object' &&
      savedPreviousQuestion.answer
    ) {
      const cue = (savedPreviousQuestion.answer as { cue?: unknown }).cue;
      const normalized =
        cue && typeof cue === 'object' && 'followUpQuestion' in cue && cue.followUpQuestion === null
          ? { ...cue, followUpQuestion: undefined }
          : cue;
      const parsed = coachingCueSchema.safeParse(normalized);
      if (parsed.success) previousCue = parsed.data;
    }
    session.value = next;
    if (previous && question.value?.id === previous) {
      needsSync.value = false;
      return;
    }
    feedback.value = next.feedbackPolicy === 'deferred' ? null : previousCue;
    feedbackQuestion.value = previousCue ? (previousQuestion ?? null) : null;
    storageError.value = '';
    draft.value = '';
    if (question.value) {
      try {
        draft.value = localStorage.getItem(draftKey(question.value.id)) ?? '';
      } catch {
        storageError.value = '无法读取本机草稿';
      }
    }
    needsSync.value = false;
  }
  async function reconcile(ticket: number) {
    const next = await api.getInterviewSession(selected);
    if (ticket === generation) apply(next);
  }
  async function refresh() {
    if (busy.value || !selected) return;
    const ticket = generation;
    busy.value = true;
    needsSync.value = true;
    error.value = '';
    try {
      const pending = pendingWrites.get(selected);
      if (pending) await pending;
      if (ticket !== generation) return;
      await reconcile(ticket);
    } catch (e) {
      if (ticket === generation) error.value = message(e);
    } finally {
      if (ticket === generation) busy.value = false;
    }
  }
  function leave() {
    ++generation;
    selected = '';
    session.value = null;
    feedback.value = null;
    feedbackQuestion.value = null;
    draft.value = '';
    error.value = '';
    busy.value = false;
    needsSync.value = true;
    storageError.value = '';
  }
  async function open(id: string) {
    leave();
    selected = id;
    await refresh();
  }

  // Every write is followed by an authoritative read, including when the response is lost.
  async function mutate(write: () => Promise<void>) {
    if (!selected || busy.value || needsSync.value) return;
    const ticket = generation;
    const target = selected;
    busy.value = true;
    needsSync.value = true;
    error.value = '';
    const pending = (async () => {
      try {
        await write();
      } catch (e) {
        if (ticket === generation) error.value = message(e);
      }
    })();
    pendingWrites.set(target, pending);
    await pending;
    if (pendingWrites.get(target) === pending) pendingWrites.delete(target);
    if (ticket !== generation) return;
    try {
      await reconcile(ticket);
    } catch (e) {
      if (ticket === generation) error.value = '请同步训练进度后继续。' + message(e);
    } finally {
      if (ticket === generation) busy.value = false;
    }
  }
  async function submit() {
    const s = session.value;
    const q = question.value;
    const answerText = draft.value.trim();
    if (answerText.length > 20000) {
      error.value = '回答不能超过 20,000 字，请校正后提交。';
      return;
    }
    if (!s || !q || !answerText || s.pausedAt || s.status !== 'active') return;
    const ticket = generation;
    const key = draftKey(q.id);
    let submittedCue: CoachingCue | null = null;
    await mutate(async () => {
      const result = await api.submitAnswer(s.id, { questionId: q.id, answerText });
      if (ticket !== generation) return;
      submittedCue = result.cue;
      try {
        localStorage.removeItem(key);
      } catch {
        /* A stale key is scoped to the answered question. */
      }
    });
    if (ticket === generation && session.value?.feedbackPolicy !== 'deferred' && submittedCue) {
      feedback.value = submittedCue;
      feedbackQuestion.value = q;
    }
  }
  async function resume() {
    const s = session.value;
    if (!s?.pausedAt || !s.activeQuestionId) return;
    const questionId = s.activeQuestionId;
    await mutate(async () => {
      await api.controlSession(s.id, 'resume', questionId, s.version);
    });
  }
  async function finish() {
    if (!['active', 'awaiting_finish'].includes(session.value?.status ?? '')) return;
    const id = selected;
    await mutate(async () => {
      await api.finishInterviewSession(id);
    });
  }
  async function control(action: 'skip' | 'pause' | 'resume') {
    const current = session.value;
    if (!current?.activeQuestionId || !['active', 'awaiting_finish'].includes(current.status))
      return;
    const questionId = current.activeQuestionId;
    await mutate(async () => {
      await api.controlSession(current.id, action, questionId, current.version);
    });
  }
  return {
    session,
    question,
    draft,
    feedback,
    feedbackQuestion,
    error,
    storageError,
    busy,
    needsSync,
    open,
    refresh,
    leave,
    edit,
    appendTranscript,
    control,
    submit,
    resume,
    finish,
  };
});
