import { describe, expect, it } from 'vitest';
import { inspectWav } from './wav.js';
import { createWav } from './wav.test-fixture.js';

describe('inspectWav', () => {
  it('accepts mono 16 kHz 16-bit PCM and the exact three-minute boundary', () => {
    expect(inspectWav(createWav())).toEqual({ durationSeconds: 0.1 });
    expect(inspectWav(createWav(5_760_000))).toEqual({ durationSeconds: 180 });
  });

  it.each([
    ['non-WAV data', () => Buffer.from('this is not a WAV recording')],
    ['truncated header', () => createWav().subarray(0, 20)],
    ['truncated payload', () => createWav().subarray(0, 100)],
    ['empty PCM', () => createWav(0)],
    ['too long PCM', () => createWav(5_760_002)],
    ['oversized file', () => createWav(6 * 1024 * 1024)],
    ['wrong container size', () => changeUInt32(4, 12)],
    [
      'a forged RIFF signature with a high bit set',
      () => {
        const wav = createWav();
        wav[0] = 0xd2;
        return wav;
      },
    ],
    ['wrong format', () => changeUInt16(20, 3)],
    ['stereo', () => changeUInt16(22, 2)],
    ['wrong sample rate', () => changeUInt32(24, 44100)],
    ['wrong byte rate', () => changeUInt32(28, 16000)],
    ['wrong block alignment', () => changeUInt16(32, 1)],
    ['wrong bit depth', () => changeUInt16(34, 8)],
    ['chunk extending past the container', () => changeUInt32(40, 999999)],
    ['incomplete PCM sample', () => createWav(3)],
    ['missing format chunk', () => renameChunk(12, 'JUNK')],
    ['missing data chunk', () => renameChunk(36, 'JUNK')],
  ])('rejects %s', (_label, makeWav) => {
    expect(() => inspectWav(makeWav())).toThrow();
  });

  it('accepts an unrelated chunk with RIFF padding before the data', () => {
    const wav = createWav();
    const chunk = Buffer.from([0x4a, 0x55, 0x4e, 0x4b, 1, 0, 0, 0, 7, 0]);
    const extended = Buffer.concat([wav.subarray(0, 36), chunk, wav.subarray(36)]);
    extended.writeUInt32LE(extended.length - 8, 4);
    expect(inspectWav(extended)).toEqual({ durationSeconds: 0.1 });
  });

  it('rejects multiple data chunks instead of undercounting the recording', () => {
    const wav = createWav();
    const extended = Buffer.concat([wav, wav.subarray(36)]);
    extended.writeUInt32LE(extended.length - 8, 4);
    expect(() => inspectWav(extended)).toThrow();
  });
});

function changeUInt16(offset: number, value: number) {
  const wav = createWav();
  wav.writeUInt16LE(value, offset);
  return wav;
}

function changeUInt32(offset: number, value: number) {
  const wav = createWav();
  wav.writeUInt32LE(value, offset);
  return wav;
}

function renameChunk(offset: number, name: string) {
  const wav = createWav();
  wav.write(name, offset);
  return wav;
}
