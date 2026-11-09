import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';

export const MAX_AUDIO_BYTES = 6 * 1024 * 1024;
const MAX_DURATION_SECONDS = 180;
const SAMPLE_RATE = 16_000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

export type WavInspection = { durationSeconds: number };

type WavChunk = { start: number; size: number };

export function inspectWav(buffer: Buffer): WavInspection {
  if (buffer.byteLength > MAX_AUDIO_BYTES) {
    throw new PayloadTooLargeException('录音文件不能超过 6 MB');
  }
  if (
    buffer.byteLength < 44 ||
    buffer.toString('latin1', 0, 4) !== 'RIFF' ||
    buffer.toString('latin1', 8, 12) !== 'WAVE'
  ) {
    throw new BadRequestException('录音必须是有效的 PCM WAV 文件');
  }

  const riffSize = buffer.readUInt32LE(4);
  if (riffSize !== buffer.byteLength - 8) {
    throw new BadRequestException('录音 WAV 容器长度无效');
  }

  let offset = 12;
  let format:
    | {
        encoding: number;
        channels: number;
        sampleRate: number;
        byteRate: number;
        blockAlign: number;
        bitsPerSample: number;
      }
    | undefined;
  let data: WavChunk | undefined;
  while (offset < buffer.byteLength) {
    if (offset + 8 > buffer.byteLength) {
      throw new BadRequestException('录音 WAV 数据不完整');
    }

    const chunkId = buffer.toString('latin1', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkSize;
    const nextOffset = chunkEnd + (chunkSize % 2);
    if (chunkEnd > buffer.byteLength || nextOffset > buffer.byteLength) {
      throw new BadRequestException('录音 WAV 数据不完整');
    }

    if (chunkId === 'fmt ') {
      if (format || chunkSize < 16) {
        throw new BadRequestException('录音 WAV 格式块无效');
      }
      format = {
        encoding: buffer.readUInt16LE(chunkStart),
        channels: buffer.readUInt16LE(chunkStart + 2),
        sampleRate: buffer.readUInt32LE(chunkStart + 4),
        byteRate: buffer.readUInt32LE(chunkStart + 8),
        blockAlign: buffer.readUInt16LE(chunkStart + 12),
        bitsPerSample: buffer.readUInt16LE(chunkStart + 14),
      };
    } else if (chunkId === 'data') {
      if (data) {
        throw new BadRequestException('录音 WAV 数据块无效');
      }
      data = { start: chunkStart, size: chunkSize };
    }

    offset = nextOffset;
  }

  if (
    !format ||
    !data ||
    format.encoding !== 1 ||
    format.channels !== CHANNELS ||
    format.sampleRate !== SAMPLE_RATE ||
    format.bitsPerSample !== BITS_PER_SAMPLE ||
    format.blockAlign !== (CHANNELS * BITS_PER_SAMPLE) / 8 ||
    format.byteRate !== SAMPLE_RATE * format.blockAlign
  ) {
    throw new BadRequestException('录音必须使用 16 kHz、单声道、16-bit PCM 格式');
  }
  if (data.size === 0 || data.size % format.blockAlign !== 0) {
    throw new BadRequestException('录音 WAV 数据长度无效');
  }

  const durationSeconds = data.size / format.byteRate;
  if (durationSeconds > MAX_DURATION_SECONDS) {
    throw new BadRequestException('录音时长不能超过 180 秒');
  }

  return { durationSeconds };
}
