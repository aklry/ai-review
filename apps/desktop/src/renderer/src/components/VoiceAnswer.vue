<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import { readClip, saveClip, wavForRecognition } from '../lib/recordings.js';
const props = defineProps<{
  questionId: string;
  language?: string;
  readonly?: boolean;
  disabled?: boolean;
}>();
const emit = defineEmits<{ transcript: [text: string]; busy: [busy: boolean] }>();
const playing = ref(''),
  status = ref(''),
  recording = ref(false),
  working = ref(false);
let clip: Blob | undefined,
  recorder: MediaRecorder | undefined,
  stream: MediaStream | undefined,
  timer: ReturnType<typeof setTimeout> | undefined,
  alive = true,
  version = 0;
function show(blob?: Blob) {
  if (playing.value) URL.revokeObjectURL(playing.value);
  clip = blob;
  playing.value = blob ? URL.createObjectURL(blob) : '';
}
function stop() {
  if (recorder?.state === 'recording') recorder.stop();
  clearTimeout(timer);
  stream?.getTracks().forEach((t) => t.stop());
}
onMounted(async () => {
  const n = version;
  try {
    const blob = await readClip(props.questionId);
    if (alive && version === n) show(blob);
  } catch {
    /* Recording remains optional. */
  }
});
watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) stop();
  },
);
watch([working, recording], () => emit('busy', working.value || recording.value), {
  flush: 'sync',
});
onBeforeUnmount(() => {
  alive = false;
  stop();
  show();
  emit('busy', false);
});
async function record() {
  if (working.value || recording.value || props.disabled) return;
  const key = props.questionId;
  version++;
  working.value = true;
  status.value = '';
  try {
    const media = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream = media;
    if (!alive || props.disabled) {
      stop();
      return;
    }
    const chunks: Blob[] = [];
    const r = new MediaRecorder(media);
    recorder = r;
    r.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    r.onstop = async () => {
      media.getTracks().forEach((t) => t.stop());
      clearTimeout(timer);
      const blob = new Blob(chunks, { type: r.mimeType });
      if (alive) {
        working.value = true;
        recording.value = false;
        status.value = '正在保存录音…';
      }
      try {
        if (!blob.size) {
          if (alive) status.value = '录音为空，请重录。';
          return;
        }
        await saveClip(key, blob);
        if (alive) {
          show(blob);
          status.value = '录音已保存在本机';
        }
      } catch {
        if (alive) {
          show(blob);
          status.value = '本机存储不可用，本次仍可回听。';
        }
      } finally {
        if (alive) working.value = false;
      }
    };
    r.start();
    recording.value = true;
    timer = setTimeout(stop, 180000);
  } catch {
    stop();
    if (alive) status.value = '麦克风不可用，请检查权限或输入文字。';
  } finally {
    if (alive) working.value = false;
  }
}
async function transcribe() {
  if (!clip || working.value) return;
  working.value = true;
  status.value = '正在本机转写…';
  try {
    const text = await window.desktopApi.transcribeWav(
      await wavForRecognition(clip),
      props.language ?? 'zh-CN',
    );
    if (alive) {
      emit('transcript', text);
      status.value = '转写已加入回答，可校正后提交。';
    }
  } catch (e) {
    if (alive) status.value = e instanceof Error ? e.message : '转写失败，可手动输入。';
  } finally {
    if (alive) working.value = false;
  }
}
async function discard() {
  version++;
  try {
    await saveClip(props.questionId, null);
    if (alive) {
      show();
      status.value = '录音已删除';
    }
  } catch {
    status.value = '删除失败，请重试';
  }
}
</script>
<template>
  <div v-if="!readonly || playing" class="voice-answer">
    <button
      v-if="!readonly"
      type="button"
      :disabled="disabled || working"
      @click="recording ? stop() : record()"
    >
      {{ recording ? '停止录音' : playing ? '重新录音' : '录音回答' }}
    </button>
    <audio v-if="playing" :src="playing" controls aria-label="本题录音" />
    <button
      v-if="playing && !readonly"
      type="button"
      :disabled="working || recording || disabled"
      @click="transcribe"
    >
      转为文字
    </button>
    <button
      v-if="playing"
      type="button"
      :disabled="working || recording || disabled"
      @click="discard"
    >
      删除录音</button
    ><span role="status">{{ status }}</span>
  </div>
</template>
<style scoped>
.voice-answer {
  display: flex;
  gap: 0.65rem;
  align-items: center;
  flex-wrap: wrap;
  margin: 0.75rem 0;
}
.voice-answer audio {
  height: 2.4rem;
}
</style>
