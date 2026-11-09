const databaseName = 'interview-audio-v1';
const storeName = 'clips';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('本机存储不可用'));
      return;
    }
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName))
        request.result.createObjectStore(storeName);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('无法打开本机录音存储'));
    request.onblocked = () => reject(new Error('本机录音存储正被其他页面占用'));
  });
}

async function access(key: string, blob?: Blob | null): Promise<Blob | undefined> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, blob === undefined ? 'readonly' : 'readwrite');
      const clips = tx.objectStore(storeName);
      const request =
        blob === undefined
          ? clips.get(key)
          : blob === null
            ? clips.delete(key)
            : clips.put(blob, key);
      tx.oncomplete = () =>
        resolve(blob === undefined ? (request as IDBRequest<Blob>).result : undefined);
      tx.onabort = () => reject(tx.error ?? new Error('本机录音存储失败'));
      tx.onerror = () => reject(tx.error ?? new Error('本机录音存储失败'));
    });
  } finally {
    db.close();
  }
}

export const readClip = (key: string) => access(key);
export const saveClip = (key: string, blob: Blob | null) => access(key, blob);

export async function wavForRecognition(blob: Blob): Promise<Blob> {
  const decoder = new AudioContext();
  let input: AudioBuffer;
  try {
    input = await decoder.decodeAudioData(await blob.arrayBuffer());
  } finally {
    await decoder.close();
  }

  if (!Number.isFinite(input.duration) || input.duration <= 0 || input.duration > 180)
    throw new Error('录音最长为三分钟');

  const rate = 16000;
  const offline = new OfflineAudioContext(1, Math.ceil(input.duration * rate), rate);
  const source = offline.createBufferSource();
  source.buffer = input;
  source.connect(offline.destination);
  source.start();
  const samples = (await offline.startRendering()).getChannelData(0);
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const tag = (offset: number, value: string) => bytes.set(new TextEncoder().encode(value), offset);

  tag(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tag(36, 'data');
  view.setUint32(40, bytes.length - 44, true);
  samples.forEach((sample, index) => {
    const bounded = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + index * 2, Math.round(bounded * (bounded < 0 ? 32768 : 32767)), true);
  });
  return new Blob([bytes], { type: 'audio/wav' });
}
