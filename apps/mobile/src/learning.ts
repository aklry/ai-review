import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { LearningItem } from '@interview-assistant/contracts';
import { address, api, message } from './connection';

export function compareLearning(item: LearningItem) {
  if (item.attempts.length < 2) return [];
  const first = item.attempts[0]!.cue.rubricEvaluation;
  const last = item.attempts.at(-1)!.cue.rubricEvaluation;
  const snapshot = item.question.rubricSnapshot;
  if (
    ![first, last].every(
      (value) =>
        value?.bankId === snapshot.bankId &&
        value?.questionVersion === snapshot.questionVersion &&
        value?.rubricVersion === snapshot.rubricVersion,
    )
  )
    return [];
  return snapshot.criteria.map((criterion) => {
    const before = first!.items.find((entry) => entry.criterionId === criterion.id)?.status;
    const after = last!.items.find((entry) => entry.criterionId === criterion.id)?.status;
    return {
      ...criterion,
      before,
      after,
      change:
        !before || !after
          ? '暂无可比评分'
          : before !== 'met' && after === 'met'
            ? '新满足'
            : before === 'met' && after !== 'met'
              ? '需重新加强'
              : after === 'met'
                ? '保持满足'
                : '仍待加强',
    };
  });
}

export const useLearning = defineStore('learning', () => {
  const item = ref<LearningItem>();
  const day = ref('');
  const completed = ref(false);
  const draft = ref('');
  const busy = ref(false);
  const error = ref('');
  const storageError = ref('');
  const notice = ref('');
  const needsSync = ref(false);
  const showResults = ref(false);
  let generation = 0;
  let requestId = '';
  const key = (value: LearningItem) =>
    JSON.stringify([address, 'learning-draft', value.id, value.version]);
  function saveDraft() {
    if (!item.value) return;
    try {
      localStorage.setItem(key(item.value), JSON.stringify({ text: draft.value, requestId }));
      storageError.value = '';
    } catch {
      storageError.value = '草稿无法保存到本机，请保持页面打开。';
    }
  }
  function apply(next: LearningItem) {
    const previous = item.value;
    const ownSubmission = next.attempts.some((attempt) => attempt.requestId === requestId);
    const retainedDraft =
      previous?.id === next.id && previous.version !== next.version && !ownSubmission
        ? draft.value
        : '';
    item.value = next;
    if (previous?.id === next.id && previous.version === next.version) return;
    draft.value = '';
    requestId = '';
    try {
      if (previous?.id === next.id && previous.version !== next.version && !retainedDraft)
        localStorage.removeItem(key(previous));
      const saved = JSON.parse(localStorage.getItem(key(next)) ?? '{}') as Record<string, unknown>;
      if (typeof saved.text === 'string') draft.value = saved.text;
      if (typeof saved.requestId === 'string') requestId = saved.requestId;
      storageError.value = '';
    } catch {
      storageError.value = '无法读取本机草稿。';
    }
    if (retainedDraft) {
      draft.value = retainedDraft;
      requestId = '';
      saveDraft();
      notice.value = '检测到新的作答记录，已保留本机草稿。请核对后再提交。';
    }
    showResults.value = next.attempts.length > 0 && !draft.value;
  }
  async function open(id?: string) {
    const ticket = ++generation;
    item.value = undefined;
    draft.value = day.value = error.value = storageError.value = requestId = notice.value = '';
    completed.value = showResults.value = false;
    needsSync.value = false;
    busy.value = true;
    try {
      if (id) {
        const next = await api.getLearning(id);
        if (ticket === generation) apply(next);
      } else {
        const daily = await api.dailyLearning();
        if (ticket !== generation) return;
        day.value = daily.day;
        completed.value = daily.completed;
        apply(daily.item);
        showResults.value = daily.completed && !draft.value;
      }
    } catch (cause) {
      if (ticket === generation) error.value = message(cause);
    } finally {
      if (ticket === generation) busy.value = false;
    }
  }
  function edit(text: string) {
    draft.value = text;
    requestId = '';
    saveDraft();
  }
  function appendTranscript(text: string) {
    edit([draft.value, text].filter(Boolean).join('\n'));
  }
  async function refresh() {
    if (!item.value || busy.value) return;
    const ticket = generation;
    busy.value = true;
    try {
      const daily = day.value ? await api.dailyLearning() : undefined;
      const next = daily?.item ?? (await api.getLearning(item.value.id));
      if (ticket === generation) {
        const changedDay = daily && daily.day !== day.value;
        apply(next);
        if (daily) {
          day.value = daily.day;
          completed.value = daily.completed;
          if (changedDay) {
            showResults.value = daily.completed && !draft.value;
            notice.value = '已更新为新一天的练习，之前的草稿仍保存在对应题目中。';
          }
        }
        needsSync.value = false;
        error.value = '';
      }
    } catch (cause) {
      if (ticket === generation) {
        error.value = message(cause);
        needsSync.value = true;
      }
    } finally {
      if (ticket === generation) busy.value = false;
    }
  }
  async function submit() {
    if (
      !item.value ||
      busy.value ||
      needsSync.value ||
      !draft.value.trim() ||
      draft.value.trim().length > 20000
    )
      return;
    const ticket = generation;
    const id = item.value.id;
    if (!requestId) requestId = crypto.randomUUID();
    saveDraft();
    busy.value = true;
    error.value = '';
    try {
      const next = await api.answerLearning(id, {
        requestId,
        version: item.value.version,
        answerText: draft.value.trim(),
      });
      if (ticket === generation) {
        apply(next);
        showResults.value = true;
        completed.value = true;
      }
    } catch (cause) {
      if (ticket !== generation) return;
      error.value = message(cause);
      needsSync.value = true;
      try {
        const next = await api.getLearning(id);
        if (ticket !== generation) return;
        const recovered = next.attempts.some((attempt) => attempt.requestId === requestId);
        apply(next);
        needsSync.value = false;
        if (recovered) {
          error.value = '';
          showResults.value = true;
          completed.value = true;
        }
      } catch {
        /* Keep the answer and require explicit synchronization before retry. */
      }
    } finally {
      if (ticket === generation) busy.value = false;
    }
  }
  async function update(data: Partial<Pick<LearningItem, 'bookmarked' | 'reviewStatus'>>) {
    if (!item.value || busy.value) return;
    const ticket = generation;
    busy.value = true;
    try {
      const next = await api.updateLearning(item.value.id, data);
      if (ticket === generation) {
        apply(next);
        error.value = '';
      }
    } catch (cause) {
      if (ticket === generation) error.value = message(cause);
    } finally {
      if (ticket === generation) busy.value = false;
    }
  }
  function leave() {
    generation++;
    busy.value = false;
  }
  return {
    item,
    day,
    completed,
    draft,
    busy,
    error,
    storageError,
    notice,
    needsSync,
    showResults,
    open,
    edit,
    appendTranscript,
    refresh,
    submit,
    update,
    leave,
  };
});
