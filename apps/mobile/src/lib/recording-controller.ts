export interface RecordingState {
  recording: boolean;
  busy: boolean;
  elapsedSeconds: number;
  status: string;
  clip?: Blob | undefined;
  saved?: boolean | undefined;
}

interface RecordingControllerOptions {
  getUserMedia: () => Promise<MediaStream>;
  createRecorder: (stream: MediaStream) => MediaRecorder;
  save: (key: string, blob: Blob) => Promise<void>;
  onState: (state: RecordingState) => void;
}

export function createRecordingController(options: RecordingControllerOptions) {
  let state: RecordingState = {
    recording: false,
    busy: false,
    elapsedSeconds: 0,
    status: '',
  };
  let recorder: MediaRecorder | undefined;
  let awaitingStop = false;
  let stream: MediaStream | undefined;
  let chunks: Blob[] = [];
  let generation = 0;
  let requestingPermission = false;
  let disposed = false;
  let startedAt = 0;
  let tickTimer: ReturnType<typeof setInterval> | undefined;
  let maxDurationTimer: ReturnType<typeof setTimeout> | undefined;

  function publish(patch: Partial<RecordingState>) {
    state = { ...state, ...patch, clip: patch.clip, saved: patch.saved };
    if (!disposed) options.onState(state);
  }

  function clearTimers() {
    if (tickTimer) clearInterval(tickTimer);
    if (maxDurationTimer) clearTimeout(maxDurationTimer);
    tickTimer = undefined;
    maxDurationTimer = undefined;
  }

  function release(media: MediaStream | undefined) {
    media?.getTracks().forEach((track) => track.stop());
  }

  async function persistClip(key: string, blob: Blob) {
    try {
      await options.save(key, blob);
      publish({ clip: blob, saved: true, busy: false, status: '录音已保存在本机' });
    } catch {
      publish({ clip: blob, saved: false, busy: false, status: '本机存储不可用，本次仍可回听。' });
    }
  }

  async function start(key: string) {
    if (disposed || state.busy || state.recording || !key) return;
    const currentGeneration = ++generation;
    requestingPermission = true;
    publish({ busy: true, status: '', elapsedSeconds: 0 });
    let media: MediaStream | undefined;
    try {
      media = await options.getUserMedia();
      if (disposed || currentGeneration !== generation) {
        release(media);
        return;
      }
      requestingPermission = false;
      stream = media;
      chunks = [];
      const currentRecorder = options.createRecorder(media);
      recorder = currentRecorder;
      currentRecorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      currentRecorder.onerror = () => {
        publish({ status: '录音中断，正在保存已录制的内容。' });
        stop();
      };
      currentRecorder.onstop = () => {
        awaitingStop = false;
        clearTimers();
        release(stream);
        stream = undefined;
        if (recorder === currentRecorder) recorder = undefined;
        const clip = new Blob(chunks, { type: currentRecorder.mimeType || 'audio/webm' });
        chunks = [];
        publish({ recording: false, busy: true, status: '正在保存录音…' });
        if (!clip.size) {
          publish({ busy: false, status: '没有录到音频，请重试。' });
          return;
        }
        void persistClip(key, clip);
      };
      currentRecorder.start();
      startedAt = Date.now();
      publish({ recording: true, busy: false, elapsedSeconds: 0, status: '正在录音' });
      tickTimer = setInterval(() => {
        publish({ elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000) });
      }, 1000);
      maxDurationTimer = setTimeout(() => stop(), 179500);
    } catch {
      release(media);
      if (currentGeneration === generation && !disposed) {
        requestingPermission = false;
        stream = undefined;
        recorder = undefined;
        publish({ recording: false, busy: false, status: '麦克风不可用，请检查权限或输入文字。' });
      }
    }
  }

  function stop() {
    clearTimers();
    if (requestingPermission) {
      requestingPermission = false;
      generation++;
      publish({ recording: false, busy: false });
      return;
    }
    if (!recorder || recorder.state !== 'recording') return;
    awaitingStop = true;
    publish({ recording: false, busy: true, status: '正在保存录音…' });
    try {
      recorder.stop();
    } catch {
      release(stream);
      stream = undefined;
      recorder = undefined;
      awaitingStop = false;
      publish({ recording: false, busy: false, status: '录音已中断，请重试。' });
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    stop();
    if (requestingPermission) generation++;
    if (!awaitingStop && (!recorder || recorder.state !== 'recording')) {
      release(stream);
      stream = undefined;
    }
  }

  return { start, stop, dispose };
}
