import { ref, shallowRef } from 'vue';
import { defineStore } from 'pinia';
import type { PracticeTaskView } from '@interview-assistant/contracts';
import { address, api, message } from './connection';

export const usePractice = defineStore('practice', () => {
  const task = shallowRef<PracticeTaskView | null>(null);
  const draft = ref('');
  const busy = ref(false);
  const needsSync = ref(true);
  const error = ref('');
  const storageError = ref('');
  let questionId = '';
  let criterionId = '';
  let generation = 0;
  const pendingWrites = new Map<string, Promise<void>>();
  const targetKey = () => JSON.stringify([questionId, criterionId]);
  const key = (id: string, stage: number) => JSON.stringify([address, 'practice', id, stage]);

  function edit(value: string) {
    draft.value = value;
    if (!task.value || task.value.stage >= 3) return;
    try {
      if (value) localStorage.setItem(key(task.value.id, task.value.stage), value);
      else localStorage.removeItem(key(task.value.id, task.value.stage));
      storageError.value = '';
    } catch {
      storageError.value = '本机无法保存草稿，请保持此页面打开。';
    }
  }
  function appendTranscript(value: string) {
    const text = value.trim();
    if (text) edit([draft.value.trim(), text].filter(Boolean).join('\n'));
  }
  function apply(next: PracticeTaskView) {
    const previous = task.value;
    if (previous?.id === next.id && previous.stage === next.stage) {
      task.value = next;
      needsSync.value = false;
      return;
    }
    try {
      if (previous?.id === next.id && previous.stage < next.stage)
        localStorage.removeItem(key(previous.id, previous.stage));
      draft.value = next.stage < 3 ? (localStorage.getItem(key(next.id, next.stage)) ?? '') : '';
      storageError.value = '';
    } catch {
      draft.value = '';
      storageError.value = '无法读取或保存本机草稿。';
    }
    task.value = next;
    needsSync.value = false;
  }
  async function refresh() {
    if (busy.value || !questionId || !criterionId) return;
    const ticket = generation;
    busy.value = true;
    needsSync.value = true;
    error.value = '';
    try {
      const pending = pendingWrites.get(targetKey());
      if (pending) await pending;
      if (ticket !== generation) return;
      const next = await api.startPractice(questionId, criterionId);
      if (ticket === generation) apply(next);
    } catch (cause) {
      if (ticket === generation) error.value = message(cause);
    } finally {
      if (ticket === generation) busy.value = false;
    }
  }
  function leave() {
    generation++;
    questionId = criterionId = '';
    task.value = null;
    draft.value = error.value = storageError.value = '';
    busy.value = false;
    needsSync.value = true;
  }
  async function open(question: string, criterion: string) {
    leave();
    questionId = question;
    criterionId = criterion;
    await refresh();
  }
  async function submit() {
    const current = task.value;
    if (draft.value.trim().length > 20000) {
      error.value = '回答不能超过 20,000 字，请校正后提交。';
      return;
    }
    if (!current || current.stage >= 3 || !draft.value.trim() || busy.value || needsSync.value)
      return;
    const ticket = generation;
    const target = targetKey();
    busy.value = true;
    needsSync.value = true;
    error.value = '';
    const answer = draft.value.trim();
    const pending = (async () => {
      try {
        await api.submitPracticeAnswer(current.id, current.stage, answer);
      } catch (cause) {
        if (ticket === generation) error.value = message(cause);
      }
    })();
    pendingWrites.set(target, pending);
    await pending;
    if (pendingWrites.get(target) === pending) pendingWrites.delete(target);
    if (ticket !== generation) return;
    try {
      const next = await api.startPractice(questionId, criterionId);
      if (ticket === generation) apply(next);
    } catch (cause) {
      if (ticket === generation) error.value = '请同步练习进度后继续。' + message(cause);
    } finally {
      if (ticket === generation) busy.value = false;
    }
  }
  return {
    task,
    draft,
    busy,
    needsSync,
    error,
    storageError,
    open,
    refresh,
    leave,
    edit,
    appendTranscript,
    submit,
  };
});
