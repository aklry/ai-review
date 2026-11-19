import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import type { PracticeTaskView } from '@interview-assistant/contracts';
import { startPractice, submitPracticeAnswer } from '../api/interview.js';
import { apiClient } from '../lib/http.js';

export const usePracticeStore = defineStore('practice', () => {
  const task = shallowRef<PracticeTaskView | null>(null);
  const answer = ref('');
  const busy = ref(false);
  const needsSync = ref(true);
  const error = ref('');
  const storageError = ref('');
  const earlierDrafts = ref<{ stage: number; text: string }[]>([]);
  const pending = new Map<string, Promise<PracticeTaskView>>();
  let generation = 0;
  let questionId = '';
  let criterionId = '';

  const target = () => JSON.stringify([questionId, criterionId]);
  const draftKey = (id: string, stage: number) =>
    JSON.stringify(['interview.practice-draft', apiClient.defaults.baseURL, id, stage]);

  function edit(text: string) {
    const current = task.value;
    if (!current || current.stage === 3 || busy.value) return;
    answer.value = text;
    try {
      const key = draftKey(current.id, current.stage);
      if (text) localStorage.setItem(key, text);
      else localStorage.removeItem(key);
      storageError.value = '';
    } catch {
      storageError.value = '草稿无法保存到本机，请保持页面打开。';
    }
  }

  function apply(next: PracticeTaskView) {
    const previous = task.value;
    const sameTask = next.id === previous?.id;
    if (sameTask && next.stage < previous.stage) throw new Error('练习进度已更新，请重新同步。');
    earlierDrafts.value = [];
    try {
      const olderDrafts = next.attempts.flatMap((attempt, stage) => {
        const key = draftKey(next.id, stage);
        const saved =
          sameTask && stage === previous.stage ? answer.value : localStorage.getItem(key);
        if (!saved?.trim()) return [];
        if (saved.trim() !== attempt.answerText) return [{ stage, text: saved }];
        localStorage.removeItem(key);
        return [];
      });
      earlierDrafts.value = olderDrafts;
      if (!sameTask || next.stage !== previous.stage) {
        answer.value =
          next.stage < 3 ? (localStorage.getItem(draftKey(next.id, next.stage)) ?? '') : '';
        storageError.value = '';
      }
    } catch {
      if (!sameTask || next.stage !== previous.stage) answer.value = '';
      storageError.value = '无法读取本机草稿。';
    }
    task.value = next;
    needsSync.value = false;
  }

  async function sync() {
    if (busy.value || !questionId || !criterionId) return;
    const ticket = generation;
    busy.value = true;
    needsSync.value = true;
    error.value = '';
    try {
      const write = pending.get(target());
      if (write) await write.catch(() => undefined);
      if (ticket !== generation) return;
      const next = await startPractice(questionId, criterionId);
      if (ticket === generation) apply(next);
    } catch (cause) {
      if (ticket === generation)
        error.value = cause instanceof Error ? cause.message : '加载练习失败，请重试。';
    } finally {
      if (ticket === generation) busy.value = false;
    }
  }

  function leave() {
    generation++;
    questionId = criterionId = '';
    task.value = null;
    answer.value = error.value = storageError.value = '';
    earlierDrafts.value = [];
    busy.value = false;
    needsSync.value = true;
  }

  async function open(question: string, criterion: string) {
    leave();
    questionId = question;
    criterionId = criterion;
    await sync();
  }

  async function submit() {
    const current = task.value;
    const text = answer.value.trim();
    if (!current || current.stage === 3 || busy.value || needsSync.value || !text) return;
    const ticket = generation;
    const key = target();
    busy.value = true;
    error.value = '';
    const write = submitPracticeAnswer(current.id, current.stage, text);
    pending.set(key, write);
    try {
      const next = await write;
      if (ticket === generation) apply(next);
    } catch (cause) {
      if (ticket !== generation) return;
      needsSync.value = true;
      const submissionError = cause instanceof Error ? cause.message : '提交失败';
      try {
        const next = await startPractice(questionId, criterionId);
        if (ticket !== generation) return;
        apply(next);
        if (next.stage === current.stage) error.value = submissionError + '。草稿已保留，可重试。';
      } catch {
        if (ticket === generation) error.value = submissionError + '。请同步练习进度后再提交。';
      }
    } finally {
      if (pending.get(key) === write) pending.delete(key);
      if (ticket === generation) busy.value = false;
    }
  }

  return {
    task,
    answer,
    busy,
    needsSync,
    error,
    storageError,
    earlierDrafts,
    edit,
    sync,
    open,
    leave,
    submit,
  };
});
