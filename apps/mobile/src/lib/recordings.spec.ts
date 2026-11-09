import { afterEach, describe, expect, it, vi } from 'vitest';
import { wavForRecognition } from './recordings';

class FakeAudioContext {
  async decodeAudioData() {
    return { duration: 3 / 16000, numberOfChannels: 1 } as AudioBuffer;
  }

  async close() {}
}

class FakeOfflineAudioContext {
  readonly destination = {};
  private source = { buffer: null as AudioBuffer | null, connect: vi.fn(), start: vi.fn() };

  constructor(
    readonly channels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {}

  createBufferSource() {
    return this.source;
  }

  async startRendering() {
    return {
      getChannelData: () => new Float32Array([0, 0.5, -0.5]),
    } as unknown as AudioBuffer;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('wavForRecognition', () => {
  it('encodes decoded audio as 16 kHz mono PCM16 WAV', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('OfflineAudioContext', FakeOfflineAudioContext);

    const wav = await wavForRecognition(new Blob(['source']));
    const view = new DataView(await wav.arrayBuffer());

    expect(wav.type).toBe('audio/wav');
    expect(new TextDecoder().decode(new Uint8Array(await wav.arrayBuffer()).slice(0, 4))).toBe(
      'RIFF',
    );
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(6);
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(16384);
    expect(view.getInt16(48, true)).toBe(-16384);
  });

  it('rejects audio decoded beyond the three minute limit', async () => {
    class LongAudioContext extends FakeAudioContext {
      async decodeAudioData() {
        return { duration: 180.01, numberOfChannels: 1 } as AudioBuffer;
      }
    }
    vi.stubGlobal('AudioContext', LongAudioContext);
    vi.stubGlobal('OfflineAudioContext', FakeOfflineAudioContext);

    await expect(wavForRecognition(new Blob(['source']))).rejects.toThrow('三分钟');
  });
});
