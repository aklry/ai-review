import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compile, createRenderer, h, nextTick, ref, ssrContextKey } from 'vue';
import { compileScript, parse } from 'vue/compiler-sfc';
import { api } from '../connection';
import { readClip, saveClip, wavForRecognition } from '../lib/recordings';
import VoiceAnswer from './VoiceAnswer.vue';
import componentSource from './VoiceAnswer.vue?raw';

const { descriptor } = parse(componentSource);
const bindings = compileScript(descriptor, { id: 'voice-answer-test' }).bindings;
Object.assign(VoiceAnswer, {
  render: compile(descriptor.template!.content, {
    ...(bindings ? { bindingMetadata: bindings } : {}),
    prefixIdentifiers: true,
  }),
});

vi.mock('../connection', () => ({ api: { transcribeAudio: vi.fn() } }));
vi.mock('../lib/recordings', () => ({
  readClip: vi.fn(),
  saveClip: vi.fn(),
  wavForRecognition: vi.fn(),
}));

interface HostNode {
  tag: string;
  text: string;
  props: Record<string, unknown>;
  children: HostNode[];
  parent: HostNode | null;
}

function node(tag: string, text = ''): HostNode {
  return { tag, text, props: {}, children: [], parent: null };
}

const renderer = createRenderer<HostNode, HostNode>({
  createElement: (tag) => node(tag),
  createText: (text) => node('#text', text),
  createComment: (text) => node('#comment', text),
  setText: (target, text) => {
    target.text = text;
  },
  setElementText: (target, text) => {
    target.text = text;
    target.children = [];
  },
  parentNode: (target) => target.parent,
  nextSibling: (target) => {
    const children = target.parent?.children;
    return children?.[children.indexOf(target) + 1] ?? null;
  },
  insert: (target, parent, anchor) => {
    const old = target.parent?.children;
    if (old) old.splice(old.indexOf(target), 1);
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    parent.children.splice(index < 0 ? parent.children.length : index, 0, target);
    target.parent = parent;
  },
  remove: (target) => {
    const siblings = target.parent?.children;
    if (siblings) siblings.splice(siblings.indexOf(target), 1);
    target.parent = null;
  },
  patchProp: (target, key, _, value) => {
    target.props[key] = value;
  },
});

function find(root: HostNode, match: (value: HostNode) => boolean): HostNode | undefined {
  if (match(root)) return root;
  return root.children.map((child) => find(child, match)).find(Boolean);
}

async function flush() {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
  await nextTick();
}

function mount() {
  const key = ref('clip-a');
  const transcript = vi.fn();
  const root = node('root');
  const app = renderer.createApp({
    setup: () => () => h(VoiceAnswer, { clipKey: key.value, onTranscript: transcript }),
  });
  app.provide(ssrContextKey, { modules: new Set() });
  app.mount(root);
  cleanup = () => app.unmount();
  return { root, key, transcript };
}

let cleanup = () => {};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(readClip).mockResolvedValue(undefined);
  vi.mocked(saveClip).mockResolvedValue(undefined);
  vi.mocked(wavForRecognition).mockImplementation(async (blob) => blob);
  vi.stubGlobal('document', {
    visibilityState: 'visible',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('URL', {
    createObjectURL: (blob: Blob) => `blob:${blob.size}`,
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('VoiceAnswer async isolation', () => {
  it('ignores a stored clip read that finishes after the question changes', async () => {
    let resolveOld!: (value: Blob) => void;
    vi.mocked(readClip)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce(new Blob(['new']));
    const view = mount();

    view.key.value = 'clip-b';
    await flush();
    resolveOld(new Blob(['old, larger recording']));
    await flush();

    expect(find(view.root, (target) => target.tag === 'audio')?.props.src).toBe('blob:3');
  });

  it('does not emit a transcript that returns after the question changes', async () => {
    let resolveTranscript!: (value: { text: string }) => void;
    vi.mocked(readClip).mockResolvedValue(new Blob(['audio']));
    vi.mocked(api.transcribeAudio).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTranscript = resolve;
        }),
    );
    const view = mount();
    await flush();
    const button = find(
      view.root,
      (target) => target.tag === 'button' && target.text.trim() === '转为文字',
    );
    (button?.props.onClick as () => void)();
    await flush();
    view.key.value = 'clip-b';
    await flush();
    resolveTranscript({ text: '旧题的回答' });
    await flush();

    expect(view.transcript).not.toHaveBeenCalled();
  });
});
