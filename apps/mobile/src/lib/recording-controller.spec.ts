import { describe, expect, it, vi } from 'vitest';
import { createRecordingController } from './recording-controller';

class FakeRecorder {
  static instance: FakeRecorder;
  state = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly stream: MediaStream) {
    FakeRecorder.instance = this;
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['audio']) });
    this.onstop?.();
  }
}

function stream() {
  const stop = vi.fn();
  return {
    value: { getTracks: () => [{ stop }] } as unknown as MediaStream,
    stop,
  };
}

describe('recording controller', () => {
  it('reports permission failure and leaves recording inactive', async () => {
    const state = vi.fn();
    const controller = createRecordingController({
      getUserMedia: async () => {
        throw new Error('denied');
      },
      createRecorder: (input) => new FakeRecorder(input) as unknown as MediaRecorder,
      save: vi.fn(),
      onState: state,
    });

    await controller.start('clip-a');

    expect(state).toHaveBeenLastCalledWith(
      expect.objectContaining({
        recording: false,
        busy: false,
        status: expect.stringContaining('麦克风'),
      }),
    );
  });

  it('stops tracks and saves the captured clip when recording is stopped', async () => {
    const media = stream();
    const save = vi.fn(async () => undefined);
    const state = vi.fn();
    const controller = createRecordingController({
      getUserMedia: async () => media.value,
      createRecorder: (input) => new FakeRecorder(input) as unknown as MediaRecorder,
      save,
      onState: state,
    });

    await controller.start('clip-a');
    controller.stop();
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));

    expect(save).toHaveBeenCalledWith('clip-a', expect.any(Blob));
    expect(media.stop).toHaveBeenCalledOnce();
    expect(state).toHaveBeenLastCalledWith(
      expect.objectContaining({ recording: false, busy: false, saved: true }),
    );
  });

  it('stops and saves an active recording when disposed', async () => {
    const media = stream();
    const save = vi.fn(async () => undefined);
    const controller = createRecordingController({
      getUserMedia: async () => media.value,
      createRecorder: (input) => new FakeRecorder(input) as unknown as MediaRecorder,
      save,
      onState: vi.fn(),
    });

    await controller.start('clip-a');
    controller.dispose();
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));

    expect(media.stop).toHaveBeenCalledOnce();
  });

  it('keeps the microphone alive until the final stop event flushes audio', async () => {
    const media = stream();
    const save = vi.fn(async () => undefined);
    const controller = createRecordingController({
      getUserMedia: async () => media.value,
      createRecorder: (input) => {
        const recorder = new FakeRecorder(input);
        recorder.stop = () => {
          recorder.state = 'inactive';
        };
        return recorder as unknown as MediaRecorder;
      },
      save,
      onState: vi.fn(),
    });

    await controller.start('clip-a');
    const recorder = FakeRecorder.instance;
    controller.dispose();

    expect(media.stop).not.toHaveBeenCalled();
    recorder.ondataavailable?.({ data: new Blob(['final audio']) });
    recorder.onstop?.();
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(media.stop).toHaveBeenCalledOnce();
  });

  it('releases a permission result that arrives after the controller is disposed', async () => {
    const media = stream();
    let resolveMedia!: (value: MediaStream) => void;
    const createRecorder = vi.fn((input: MediaStream) => new FakeRecorder(input));
    const controller = createRecordingController({
      getUserMedia: () =>
        new Promise((resolve) => {
          resolveMedia = resolve;
        }),
      createRecorder: createRecorder as unknown as (input: MediaStream) => MediaRecorder,
      save: vi.fn(async () => undefined),
      onState: vi.fn(),
    });

    const starting = controller.start('clip-a');
    controller.dispose();
    resolveMedia(media.value);
    await starting;

    expect(createRecorder).not.toHaveBeenCalled();
    expect(media.stop).toHaveBeenCalledOnce();
  });

  it('automatically stops before the strict three minute recording limit', async () => {
    vi.useFakeTimers();
    const media = stream();
    const save = vi.fn(async () => undefined);
    const controller = createRecordingController({
      getUserMedia: async () => media.value,
      createRecorder: (input) => new FakeRecorder(input) as unknown as MediaRecorder,
      save,
      onState: vi.fn(),
    });

    try {
      await controller.start('clip-a');
      await vi.advanceTimersByTimeAsync(179500);

      expect(save).toHaveBeenCalledOnce();
      expect(media.stop).toHaveBeenCalledOnce();
    } finally {
      controller.dispose();
      vi.useRealTimers();
    }
  });

  it('does not let an old rejected permission request orphan a newer microphone', async () => {
    const media = stream();
    let rejectOld!: (reason: Error) => void;
    const controller = createRecordingController({
      getUserMedia: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((_, reject) => {
              rejectOld = reject;
            }),
        )
        .mockResolvedValueOnce(media.value),
      createRecorder: (input) => new FakeRecorder(input) as unknown as MediaRecorder,
      save: vi.fn(async () => undefined),
      onState: vi.fn(),
    });

    const oldStart = controller.start('old');
    controller.stop();
    await controller.start('new');
    rejectOld(new Error('late rejection'));
    await oldStart;
    controller.stop();

    expect(media.stop).toHaveBeenCalledOnce();
  });

  it('publishes a saved clip only once instead of replaying it into later operations', async () => {
    const state = vi.fn();
    const controller = createRecordingController({
      getUserMedia: async () => stream().value,
      createRecorder: (input) => new FakeRecorder(input) as unknown as MediaRecorder,
      save: vi.fn(async () => undefined),
      onState: state,
    });

    await controller.start('clip-a');
    controller.stop();
    await Promise.resolve();
    state.mockClear();
    await controller.start('clip-a');

    expect(state.mock.calls.every(([value]) => value.clip === undefined)).toBe(true);
    controller.dispose();
  });
});
