import { computed, ref, shallowRef } from 'vue';
import { defineStore } from 'pinia';
import type { CoachingCue } from '@interview-assistant/contracts';
import type { SessionRecord } from '@interview-assistant/api-client';
import { address, api, message } from './connection';

export const useSession = defineStore('session', () => {
  const session = shallowRef<SessionRecord | null>(null);
  const question = computed(() =>
    session.value?.questions.find((q) => q.id === session.value?.activeQuestionId),
  );
  const draft = ref('');
  const feedback = shallowRef<CoachingCue | null>(null);
  const busy = ref(false);
  const needsSync = ref(true);
  const error = ref('');
  const storageError = ref('');
  let selected = '';
  let generation = 0;

  function draftKey(questionId: string) {
    return JSON.stringify(['interview.mobile.draft', address.value, selected, questionId]);
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
  function apply(next: SessionRecord) {
    const previous = question.value?.id;
    session.value = next;
    if (previous && question.value?.id === previous) {
      needsSync.value = false;
      return;
    }
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
    busy.value = true;
    needsSync.value = true;
    error.value = '';
    try {
      await write();
    } catch (e) {
      if (ticket === generation) error.value = message(e);
    }
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
    if (!s || !q || !answerText || s.pausedAt || s.status !== 'active') return;
    const ticket = generation;
    const key = draftKey(q.id);
    await mutate(async () => {
      const result = await api.submitAnswer(s.id, { questionId: q.id, answerText });
      if (ticket !== generation) return;
      feedback.value = s.feedbackPolicy === 'deferred' ? null : result.cue;
      try {
        localStorage.removeItem(key);
      } catch {
        /* A stale key is scoped to the answered question. */
      }
    });
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
    if (session.value?.status !== 'awaiting_finish') return;
    const id = selected;
    await mutate(async () => {
      await api.finishInterviewSession(id);
    });
  }
  return {
    session,
    question,
    draft,
    feedback,
    error,
    storageError,
    busy,
    needsSync,
    open,
    refresh,
    leave,
    edit,
    submit,
    resume,
    finish,
  };
});
