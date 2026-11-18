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
  <div v-if="!readonly || clipUrl" class="voice-answer" :class="{ 'is-recording': recording, 'has-clip': !!clipUrl }">
    <div class="voice-dock">
      <!-- 录音主触发按钮（纯文本保持测试 AST 兼容） -->
      <button
        v-if="!readonly"
        type="button"
        class="voice-btn"
        :class="{ 'recording-active': recording, 'has-audio': !!clipUrl }"
        :disabled="disabled || working"
        @click="recording ? controller?.stop() : record()"
      >{{ recording ? '停止录音' : clipUrl ? '重新录音' : '录音回答' }}</button>

      <!-- 录音中：动态声波律动与跳动时间 -->
      <div v-if="recording" class="live-soundwave" aria-label="正在录音">
        <span class="wave-bar bar-1"></span>
        <span class="wave-bar bar-2"></span>
        <span class="wave-bar bar-3"></span>
        <span class="wave-bar bar-4"></span>
        <span class="wave-bar bar-5"></span>
        <span class="recording-time" aria-live="off">{{ duration() }}</span>
      </div>

      <!-- 已录音音频控件 -->
      <div v-if="clipUrl" class="audio-player-box">
        <audio :src="clipUrl" controls aria-label="本题录音" />
      </div>

      <!-- 快捷操作区：转文字与删除（纯文本匹配测试 query） -->
      <div v-if="clipUrl" class="audio-actions">
        <button
          v-if="!readonly"
          type="button"
          class="transcribe-btn"
          :disabled="disabled || working || recording"
          @click="transcribe"
        >转为文字</button>
        <button
          type="button"
          class="discard-btn quiet"
          :disabled="disabled || working || recording"
          @click="discard"
        >删除录音</button>
      </div>
    </div>

    <!-- 状态反馈提示 -->
    <div v-if="status" class="voice-status-pill">
      <span class="status-dot"></span>
      <span role="status">{{ status }}</span>
    </div>
  </div>
</template>

<style scoped>
.voice-answer {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 14px 0 16px;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--ink) 3%, var(--surface));
  border: 1px solid var(--line);
  transition: all 200ms var(--ease);
}

.voice-answer.is-recording {
  background: color-mix(in srgb, var(--danger) 4%, var(--surface));
  border-color: color-mix(in srgb, var(--danger) 30%, transparent);
  box-shadow: 0 4px 16px rgba(220, 53, 69, 0.08);
}

.voice-dock {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

/* 现代化录音按钮 */
.voice-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  padding: 8px 18px;
  border-radius: 999px;
  border: 1.5px solid var(--accent);
  background: var(--surface);
  color: var(--accent);
  font-weight: 650;
  font-size: 14px;
  cursor: pointer;
  box-shadow: 0 2px 8px color-mix(in srgb, var(--accent) 15%, transparent);
  transition: all 180ms var(--ease);
}

.voice-btn::before {
  content: '🎙';
  margin-right: 6px;
  font-size: 15px;
}

.voice-btn:hover {
  background: var(--accent-soft);
}

.voice-btn.recording-active {
  background: var(--danger);
  border-color: var(--danger);
  color: #ffffff;
  box-shadow: 0 4px 14px rgba(220, 53, 69, 0.35);
  animation: rec-pulse 1.8s infinite;
}

.voice-btn.recording-active::before {
  content: '⏹';
  font-size: 13px;
}

/* 动态律动声波 */
.live-soundwave {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--danger) 8%, var(--surface));
}

.wave-bar {
  display: inline-block;
  width: 3.5px;
  height: 16px;
  border-radius: 999px;
  background: var(--danger);
  animation: wave-bounce 0.9s ease-in-out infinite alternate;
}

.bar-1 { animation-delay: 0.1s; height: 10px; }
.bar-2 { animation-delay: 0.3s; height: 18px; }
.bar-3 { animation-delay: 0.15s; height: 14px; }
.bar-4 { animation-delay: 0.4s; height: 20px; }
.bar-5 { animation-delay: 0.25s; height: 12px; }

@keyframes wave-bounce {
  0% { transform: scaleY(0.35); opacity: 0.5; }
  100% { transform: scaleY(1.35); opacity: 1; }
}

@keyframes rec-pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.02); }
  100% { transform: scale(1); }
}

.recording-time {
  margin-left: 6px;
  color: var(--danger);
  font-size: 13.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

/* 音频播放器美化包裹器 */
.audio-player-box {
  flex: 1 1 200px;
  display: flex;
  align-items: center;
  min-width: min(100%, 200px);
}

.audio-player-box audio {
  width: 100%;
  height: 38px;
  border-radius: 999px;
}

/* 快捷操作区 */
.audio-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.transcribe-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 38px;
  padding: 6px 16px;
  border-radius: 999px;
  border: 1px solid transparent;
  background: var(--accent-gradient);
  color: #ffffff;
  font-size: 13.5px;
  font-weight: 650;
  box-shadow: 0 2px 10px color-mix(in srgb, var(--accent) 30%, transparent);
}

.transcribe-btn::before {
  content: '✦ ';
  margin-right: 4px;
  font-size: 12px;
  color: #c4f9e4;
}

.transcribe-btn:active:not(:disabled) {
  transform: scale(0.97);
}

.discard-btn {
  min-height: 38px;
  padding: 6px 10px;
  font-size: 13px;
  color: var(--muted);
}

.discard-btn:hover {
  color: var(--danger);
}

/* 状态药丸提示 */
.voice-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  color: var(--muted);
  background: color-mix(in srgb, var(--ink) 4%, var(--surface));
  max-width: fit-content;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
}
</style>
