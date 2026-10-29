import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StreamPlayback } from '@shared/contracts/stream';
import { attachPlayback } from '../player/playbackSession';
import {
  observeRoomPreview,
  PREVIEW_DELAY_MS,
  PREVIEW_TIMEOUT_MS,
  startRoomPreview,
} from './roomPreviewSession';

vi.mock('../player/playbackSession', () => ({ attachPlayback: vi.fn() }));

const playback: StreamPlayback = {
  platform: 'douyu',
  roomId: '123',
  title: '直播',
  anchorName: '主播',
  url: 'https://example.com/live.m3u8',
  format: 'hls',
  quality: '高清',
};

function makeVideo(): HTMLVideoElement {
  return Object.assign(new EventTarget(), {
    muted: false,
    volume: 1,
    pause: vi.fn(),
  }) as unknown as HTMLVideoElement;
}

describe('hover preview lifecycle', () => {
  const resolve = vi.fn();
  const detach = vi.fn();
  const stops: Array<() => void> = [];
  const start = (
    video = makeVideo(),
    status = vi.fn(),
    platform: 'douyu' | 'bilibili' | 'huya' = 'douyu',
  ) => {
    const stop = startRoomPreview(video, platform, '123', status);
    stops.push(stop);
    return { video, status, stop };
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.stubGlobal('window', { api: { streams: { resolve } } });
    resolve.mockResolvedValue({ ok: true, data: playback });
    vi.mocked(attachPlayback).mockReturnValue(detach);
  });

  it('resumes a requested preview after focus, visibility and intersection changes without duplicate starts', async () => {
    const surface = Object.assign(new EventTarget(), { api: window.api });
    const doc = Object.assign(new EventTarget(), { hidden: false, hasFocus: () => false });
    vi.stubGlobal('window', surface);
    vi.stubGlobal('document', doc);
    let intersection!: (entries: Array<{ isIntersecting: boolean }>) => void;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: typeof intersection) {
          intersection = callback;
        }
        observe = vi.fn();
        disconnect = disconnect;
      },
    );
    const stop = observeRoomPreview(makeVideo(), 'douyu', '123', vi.fn());
    stops.push(stop);
    intersection([{ isIntersecting: true }]);
    await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS);
    expect(resolve).not.toHaveBeenCalled();
    surface.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS);
    expect(attachPlayback).toHaveBeenCalledTimes(1);
    surface.dispatchEvent(new Event('focus'));
    intersection([{ isIntersecting: true }]);
    await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS);
    expect(attachPlayback).toHaveBeenCalledTimes(1);
    surface.dispatchEvent(new Event('blur'));
    expect(detach).toHaveBeenCalledTimes(1);
    surface.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS);
    expect(attachPlayback).toHaveBeenCalledTimes(2);
    doc.hidden = true;
    doc.dispatchEvent(new Event('visibilitychange'));
    doc.hidden = false;
    doc.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS);
    expect(attachPlayback).toHaveBeenCalledTimes(3);
    intersection([{ isIntersecting: false }]);
    intersection([{ isIntersecting: true }]);
    await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS);
    expect(attachPlayback).toHaveBeenCalledTimes(4);
    stop();
    expect(disconnect).toHaveBeenCalledOnce();
    intersection([{ isIntersecting: true }]);
    surface.dispatchEvent(new Event('focus'));
    doc.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(attachPlayback).toHaveBeenCalledTimes(4);
  });
  afterEach(() => {
    stops.splice(0).forEach((stop) => stop());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not resolve a room when the pointer only passes over it', async () => {
    const { stop } = start();
    await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS - 1);
    stop();
    await vi.runAllTimersAsync();
    expect(resolve).not.toHaveBeenCalled();
  });

  it.each(['douyu', 'bilibili', 'huya'] as const)(
    'starts a muted low-quality %s preview after dwell',
    async (platform) => {
      const { video, status, stop } = start(makeVideo(), vi.fn(), platform);
      await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS);
      expect(resolve).toHaveBeenCalledWith({
        platform,
        roomId: '123',
        quality: platform === 'douyu' ? '3' : platform === 'bilibili' ? '80' : '2000',
        preferHls: true,
      });
      expect(video.muted).toBe(true);
      expect(video.volume).toBe(0);
      expect(attachPlayback).toHaveBeenCalledOnce();
      video.dispatchEvent(new Event('playing'));
      expect(status).toHaveBeenLastCalledWith('playing');
      await vi.advanceTimersByTimeAsync(PREVIEW_TIMEOUT_MS);
      expect(detach).not.toHaveBeenCalled();
      stop();
      stop();
      expect(detach).toHaveBeenCalledOnce();
    },
  );

  it('ignores a late resolve after leaving the card', async () => {
    let complete!: (value: unknown) => void;
    resolve.mockReturnValue(
      new Promise((done) => {
        complete = done;
      }),
    );
    const { stop } = start();
    await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS);
    stop();
    complete({ ok: true, data: playback });
    await vi.advanceTimersByTimeAsync(0);
    expect(attachPlayback).not.toHaveBeenCalled();
  });

  it('destroys the previous player when another card begins a preview', async () => {
    const first = start();
    await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS);
    start();
    expect(detach).toHaveBeenCalledOnce();
    expect(first.status).toHaveBeenLastCalledWith('waiting');
    await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS);
    expect(attachPlayback).toHaveBeenCalledTimes(2);
  });

  it('restores the cover on timeout and never starts a late result', async () => {
    let complete!: (value: unknown) => void;
    resolve.mockReturnValue(
      new Promise((done) => {
        complete = done;
      }),
    );
    const { status } = start();
    await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS + PREVIEW_TIMEOUT_MS);
    expect(status).toHaveBeenLastCalledWith('unavailable');
    complete({ ok: true, data: playback });
    await vi.advanceTimersByTimeAsync(0);
    expect(attachPlayback).not.toHaveBeenCalled();
  });

  it('releases a player that never produces a frame', async () => {
    const { status } = start();
    await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS + PREVIEW_TIMEOUT_MS);
    expect(detach).toHaveBeenCalledOnce();
    expect(status).toHaveBeenLastCalledWith('unavailable');
  });

  it('falls back to the cover on resolver and playback errors', async () => {
    resolve.mockRejectedValueOnce(new Error('offline'));
    const first = start();
    await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS);
    expect(first.status).toHaveBeenLastCalledWith('unavailable');
    const second = start();
    await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS);
    const options = vi.mocked(attachPlayback).mock.calls[0]![2];
    options.onError('failed');
    expect(detach).toHaveBeenCalledOnce();
    expect(second.status).toHaveBeenLastCalledWith('unavailable');
  });
});
