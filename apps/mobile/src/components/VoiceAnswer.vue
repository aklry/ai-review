<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { api } from '../connection';
import { createRecordingController, type RecordingState } from '../lib/recording-controller';
import { readClip, saveClip, wavForRecognition } from '../lib/recordings';

const props = defineProps<{
  clipKey: string;
  language?: string;
  readonly?: boolean;
  disabled?: boolean;
}>();
const emit = defineEmits<{ transcript: [text: string]; busy: [busy: boolean] }>();

const clipUrl = ref('');
const recording = ref(false);
const working = ref(false);
const elapsedSeconds = ref(0);
const status = ref('');
let clip: Blob | undefined;
let controller: ReturnType<typeof createRecordingController> | undefined;
let mounted = false;
let operation = 0;
let transcribing = false;

function displayClip(value?: Blob) {
  if (clipUrl.value) URL.revokeObjectURL(clipUrl.value);
  clip = value;
  clipUrl.value = value ? URL.createObjectURL(value) : '';
}

function acceptState(state: RecordingState) {
  recording.value = state.recording;
  working.value = state.busy;
  elapsedSeconds.value = state.elapsedSeconds;
  if (state.status) status.value = state.status;
  if (state.clip) displayClip(state.clip);
}

function makeController() {
  let instance: ReturnType<typeof createRecordingController>;
  instance = createRecordingController({
    getUserMedia: () => {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('麦克风不可用');
      return navigator.mediaDevices.getUserMedia({ audio: true });
    },
    createRecorder: (media) => new MediaRecorder(media),
    save: async (key, blob) => {
      await saveClip(key, blob);
    },
    onState: (state) => {
      if (mounted && controller === instance) acceptState(state);
    },
  });
  return instance;
}

async function loadClip(key: string) {
  const request = ++operation;
  try {
    const stored = await readClip(key);
    if (mounted && request === operation && key === props.clipKey) displayClip(stored);
  } catch {
    if (mounted && request === operation && key === props.clipKey)
      status.value = '无法读取本机录音存储。';
  }
}

function handleVisibility() {
  if (document.visibilityState === 'hidden') controller?.stop();
}

function handlePageHide() {
  controller?.stop();
}

onMounted(() => {
  mounted = true;
  controller = makeController();
  void loadClip(props.clipKey);
  document.addEventListener('visibilitychange', handleVisibility);
  window.addEventListener('pagehide', handlePageHide);
});

watch(
  () => props.clipKey,
  (key) => {
    operation++;
    controller?.dispose();
    displayClip();
    recording.value = false;
    working.value = false;
    transcribing = false;
    elapsedSeconds.value = 0;
    status.value = '';
    if (mounted) {
      controller = makeController();
      void loadClip(key);
    }
  },
);

watch([() => props.disabled, () => props.readonly], ([disabled, readonly]) => {
  if (disabled || readonly) {
    controller?.stop();
    if (transcribing) {
      operation++;
      transcribing = false;
      working.value = false;
    }
  }
});

watch([recording, working], () => emit('busy', recording.value || working.value), {
  flush: 'sync',
});

onBeforeUnmount(() => {
  mounted = false;
  operation++;
  document.removeEventListener('visibilitychange', handleVisibility);
  window.removeEventListener('pagehide', handlePageHide);
  controller?.dispose();
  controller = undefined;
  if (clipUrl.value) URL.revokeObjectURL(clipUrl.value);
  clipUrl.value = '';
  clip = undefined;
  emit('busy', false);
});

async function record() {
  if (props.disabled || props.readonly || working.value || recording.value) return;
  operation++;
  status.value = '';
  await controller?.start(props.clipKey);
}

async function transcribe() {
  const selected = clip;
  if (!selected || working.value || recording.value || props.disabled) return;
  const request = ++operation;
  const key = props.clipKey;
  working.value = true;
  transcribing = true;
  status.value = '正在转写录音…';
  try {
    const wav = await wavForRecognition(selected);
    if (!mounted || request !== operation || key !== props.clipKey || props.disabled) return;
    const language =
      props.language === 'en-US' || props.language === 'mixed' ? props.language : 'zh-CN';
    const result = await api.transcribeAudio(wav, language);
    if (mounted && request === operation && key === props.clipKey && !props.disabled) {
      emit('transcript', result.text);
      status.value = '转写已加入回答，可校正后提交。';
    }
  } catch (error) {
    if (mounted && request === operation && key === props.clipKey)
      status.value = error instanceof Error ? error.message : '转写失败，可手动输入。';
  } finally {
    if (mounted && request === operation) {
      transcribing = false;
      working.value = false;
    }
  }
}

async function discard() {
  if (working.value || recording.value || props.disabled) return;
  const request = ++operation;
  const key = props.clipKey;
  working.value = true;
  try {
    await saveClip(key, null);
    if (mounted && request === operation && key === props.clipKey) {
      displayClip();
      status.value = '录音已删除';
    }
  } catch {
    if (mounted && request === operation && key === props.clipKey)
      status.value = '删除失败，请重试。';
  } finally {
    if (mounted && request === operation) working.value = false;
  }
}

const duration = () =>
  `${Math.floor(elapsedSeconds.value / 60)}:${String(elapsedSeconds.value % 60).padStart(2, '0')}`;
</script>

<template>
  <div v-if="!readonly || clipUrl" class="voice-answer">
    <button
      v-if="!readonly"
      type="button"
      :disabled="disabled || working"
      @click="recording ? controller?.stop() : record()"
    >
      {{ recording ? '停止录音' : clipUrl ? '重新录音' : '录音回答' }}
    </button>
    <span v-if="recording" class="recording-time" aria-live="off">{{ duration() }}</span>
    <audio v-if="clipUrl" :src="clipUrl" controls aria-label="本题录音" />
    <button
      v-if="clipUrl && !readonly"
      type="button"
      :disabled="disabled || working || recording"
      @click="transcribe"
    >
      转为文字
    </button>
    <button
      v-if="clipUrl"
      type="button"
      :disabled="disabled || working || recording"
      @click="discard"
    >
      删除录音
    </button>
    <span role="status">{{ status }}</span>
  </div>
</template>

<style scoped>
.voice-answer {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin: 0.75rem 0;
}

.voice-answer audio {
  height: 2.4rem;
  max-width: 100%;
}

.recording-time {
  min-width: 3.25rem;
  font-variant-numeric: tabular-nums;
}
</style>
