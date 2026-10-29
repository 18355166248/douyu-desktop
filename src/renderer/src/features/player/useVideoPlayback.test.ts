import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StreamPlayback } from '@shared/contracts/stream';
import { attachPlayback } from './playbackSession';
import { useVideoPlayback } from './useVideoPlayback';

// Deterministic effect host: run cleanup on dependency changes, retaining hook state.
const host = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  effects: [] as Array<() => void>,
}));
vi.mock('react', () => ({
  useRef(current: unknown) {
    const index = host.cursor++;
    host.slots[index] ??= { current };
    return host.slots[index];
  },
  useState(initial: unknown) {
    const index = host.cursor++;
    if (!(index in host.slots)) host.slots[index] = initial;
    return [
      host.slots[index],
      (update: unknown) => {
        host.slots[index] = typeof update === 'function' ? update(host.slots[index]) : update;
      },
    ];
  },
  useCallback(callback: unknown) {
    return callback;
  },
  useEffect(effect: () => (() => void) | undefined, deps: unknown[]) {
    const index = host.cursor++;
    const previous = host.slots[index] as
      { deps: unknown[]; cleanup?: (() => void) | undefined } | undefined;
    if (previous && deps.every((dep, i) => Object.is(dep, previous.deps[i]))) return;
    host.effects.push(() => {
      previous?.cleanup?.();
      host.slots[index] = { deps, cleanup: effect() };
    });
  },
}));
vi.mock('./playbackSession', () => ({ attachPlayback: vi.fn() }));

class Video extends EventTarget {
  paused = true;
  currentTime = 1;
  buffered = { length: 1, start: () => 0, end: () => 20 };
  play = vi.fn(async () => {
    this.paused = false;
  });
  pause = vi.fn(() => {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  });
}
const playback: StreamPlayback = {
  platform: 'douyu',
  roomId: '1',
  title: '',
  anchorName: '',
  quality: '高清',
  url: 'https://example.test/live.flv',
  format: 'flv',
};
let video: Video;
let ref: { current: HTMLVideoElement | null };
let source: StreamPlayback;
function render(next = source) {
  source = next;
  host.cursor = 0;
  // eslint-disable-next-line react-hooks/rules-of-hooks -- deterministic hook host.
  useVideoPlayback(ref, source);
  for (const effect of host.effects.splice(0)) effect();
  host.cursor = 0;
  // eslint-disable-next-line react-hooks/rules-of-hooks -- expose the state after effects flush.
  return useVideoPlayback(ref, source);
}
function session() {
  return vi.mocked(attachPlayback).mock.calls.at(-1)![2];
}

beforeEach(() => {
  host.slots = [];
  host.effects = [];
  source = playback;
  video = new Video();
  ref = { current: video as unknown as HTMLVideoElement };
  vi.mocked(attachPlayback)
    .mockReset()
    .mockImplementation(() => () => video.pause());
});

describe('playback intent and media state', () => {
  it('preserves user pause across a source refresh or quality switch', () => {
    render().togglePlayback();
    expect(render().userPaused).toBe(true);
    render({ ...playback, quality: '原画', url: 'https://example.test/new.flv' });
    expect(session().isUserPaused()).toBe(true);
    video.dispatchEvent(new Event('canplay'));
    // Even an unexpected underlying autoplay must not break the pause.
    video.dispatchEvent(new Event('playing'));
    expect(render()).toMatchObject({ userPaused: true, isPlaying: false, reparses: 1 });
    render().togglePlayback();
    expect(session().isUserPaused()).toBe(false);
    expect(video.currentTime).toBe(18);
    expect(video.play).toHaveBeenCalledOnce();
  });

  it.each([
    { platform: 'douyu' as const, roomId: '2' },
    { platform: 'bilibili' as const, roomId: '1' },
  ])('resets intent and diagnostics when changing room identity to %j', (identity) => {
    render();
    session().onRecovering?.('network');
    render().togglePlayback();
    const state = render({ ...playback, ...identity });
    expect(session().isUserPaused()).toBe(false);
    expect(state).toMatchObject({ userPaused: false, reconnects: 0, reparses: 0, lastError: null });
  });

  it('treats waiting as buffering and allows pausing before the media starts', () => {
    render();
    video.dispatchEvent(new Event('canplay'));
    video.dispatchEvent(new Event('waiting'));
    expect(render()).toMatchObject({ isReady: true, isPlaying: false, userPaused: false });
    render().togglePlayback();
    expect(render().userPaused).toBe(true);
    expect(video.play).not.toHaveBeenCalled();
    expect(video.pause).toHaveBeenCalledOnce();
  });

  it('clears recovering on actual playback while retaining diagnostic history', () => {
    render();
    session().onRecovering?.('HLS 网络异常');
    expect(render()).toMatchObject({ recovering: true, reconnects: 1, lastError: 'HLS 网络异常' });
    video.dispatchEvent(new Event('playing'));
    expect(render()).toMatchObject({ recovering: false, isPlaying: true });
    session().onError('failed');
    expect(render()).toMatchObject({ error: 'failed', lastError: 'failed', isPlaying: false });
    render({ ...playback });
    expect(render()).toMatchObject({
      error: null,
      lastError: 'failed',
      reconnects: 1,
      reparses: 1,
    });
  });

  it('offers a retry after autoplay is blocked without treating it as user pause', async () => {
    render();
    session().onPlayRejected?.();
    expect(render()).toMatchObject({ playBlocked: true, userPaused: false });
    video.play.mockRejectedValueOnce(new Error('not allowed'));
    render().togglePlayback();
    await Promise.resolve();
    expect(render().playBlocked).toBe(true);
    render().togglePlayback();
    video.dispatchEvent(new Event('playing'));
    expect(render()).toMatchObject({ playBlocked: false, isPlaying: true });
  });

  it('ignores an old play rejection after the source has been replaced', async () => {
    let reject!: (error: Error) => void;
    video.play.mockImplementationOnce(
      () =>
        new Promise((_yes, no) => {
          reject = no;
        }),
    );
    render().togglePlayback();
    render().togglePlayback();
    render({ ...playback });
    reject(new Error('old source'));
    await Promise.resolve();
    expect(render().playBlocked).toBe(false);
  });
});
