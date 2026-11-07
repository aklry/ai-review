async function access(key: string, blob?: Blob | null): Promise<Blob | undefined> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('interview-audio-v1', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('clips');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('clips', blob === undefined ? 'readonly' : 'readwrite');
      const clips = tx.objectStore('clips');
      const op =
        blob === undefined
          ? clips.get(key)
          : blob === null
            ? clips.delete(key)
            : clips.put(blob, key);
      tx.oncomplete = () => {
        db.close();
        resolve(blob === undefined ? op.result : undefined);
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}
export const readClip = (key: string) => access(key);
export const saveClip = (key: string, blob: Blob | null) => access(key, blob);

export async function wavForRecognition(blob: Blob): Promise<Uint8Array> {
  const decoder = new AudioContext();
  let input: AudioBuffer;
  try {
    input = await decoder.decodeAudioData(await blob.arrayBuffer());
  } finally {
    await decoder.close();
  }
  if (input.duration > 182) throw new Error('录音最长为三分钟');
  const rate = 16000;
  const offline = new OfflineAudioContext(1, Math.ceil(input.duration * rate), rate);
  const src = offline.createBufferSource();
  src.buffer = input;
  src.connect(offline.destination);
  src.start();
  const samples = (await offline.startRendering()).getChannelData(0);
  const bytes = new Uint8Array(44 + samples.length * 2),
    view = new DataView(bytes.buffer);
  const tag = (offset: number, s: string) => bytes.set(new TextEncoder().encode(s), offset);
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
  samples.forEach((v, i) =>
    view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, v)) * 32767), true),
  );
  return bytes;
}
