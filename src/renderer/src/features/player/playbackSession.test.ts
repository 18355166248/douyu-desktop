import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StreamPlayback } from '@shared/contracts/stream';
import { attachPlayback } from './playbackSession';

const mocks = vi.hoisted(() => {
  interface Failure {
    fatal: boolean;
    type: string;
  }
  class FakeHls {
    static instances: FakeHls[] = [];
    static isSupported = () => true;
    static Events = { MANIFEST_PARSED: 'manifest', ERROR: 'error' };
    static ErrorTypes = { NETWORK_ERROR: 'network', MEDIA_ERROR: 'media' };
    handlers = new Map<string, (event: string, data: Failure) => void>();
    constructor() {
      FakeHls.instances.push(this);
    }
    on(event: string, callback: (event: string, data: Failure) => void) {
      this.handlers.set(event, callback);
    }
    loadSource = vi.fn(() =>
      this.handlers.get('manifest')?.('manifest', { fatal: false, type: '' }),
    );
    attachMedia = vi.fn();
    startLoad = vi.fn();
    recoverMediaError = vi.fn();
    destroy = vi.fn();
    fail(type = 'network') {
      this.handlers.get('error')?.('error', { fatal: true, type });
    }
  }
  const flv = {
    attachMediaElement: vi.fn(),
    on: vi.fn<(event: string, handler: () => void) => void>(),
    load: vi.fn(),
    pause: vi.fn(),
    unload: vi.fn(),
    detachMediaElement: vi.fn(),
    destroy: vi.fn(),
  };
  return { FakeHls, flv, createFlv: vi.fn(() => flv) };
});
vi.mock('hls.js', () => ({ default: mocks.FakeHls }));
vi.mock('mpegts.js', () => ({
  default: {
    isSupported: () => true,
    createPlayer: mocks.createFlv,
    Events: { ERROR: 'error', LOADING_COMPLETE: 'complete' },
  },
}));

class FakeVideo extends EventTarget {
  currentTime = 0;
  paused = true;
  seeking = false;
  error: { code: number } | null = null;
  play = vi.fn(async () => {
    this.paused = false;
  });
  load = vi.fn();
  removeAttribute = vi.fn();
  canPlayType = vi.fn(() => '');
  advance(time: number) {
    this.currentTime = time;
    this.dispatchEvent(new Event('timeupdate'));
  }
}
const playback: StreamPlayback = {
  platform: 'huya',
  roomId: '1',
  title: '',
  anchorName: '',
  quality: '自动',
  url: 'http://127.0.0.1:1234/live.m3u8',
  format: 'hls',
};
let cleanup: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.FakeHls.instances = [];
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.useRealTimers();
});

async function start(paused = false, format = playback.format) {
  const video = new FakeVideo();
  const error = vi.fn();
  const recovering = vi.fn();
  cleanup = attachPlayback(
    video as unknown as HTMLVideoElement,
    {
      ...playback,
      format,
      url: format === 'hls' ? playback.url : 'https://cdn.example/live.flv',
    },
    { isUserPaused: () => paused, onError: error, onRecovering: recovering },
  );
  await vi.dynamicImportSettled();
  return { video, error, recovering, hls: mocks.FakeHls.instances[0]! };
}

describe('playback session recovery', () => {
  it('prioritizes a native decode error over a pending HLS network retry', async () => {
    const { video, hls, error, recovering } = await start();
    hls.fail('network');
    video.error = { code: 3 };
    video.dispatchEvent(new Event('error'));
    await vi.advanceTimersByTimeAsync(400);
    expect(hls.recoverMediaError).toHaveBeenCalledOnce();
    expect(hls.loadSource).toHaveBeenCalledTimes(1);
    expect(recovering).toHaveBeenCalledOnce();
    expect(error).not.toHaveBeenCalled();
  });

  it.each(['network', 'media'])('reports exceptions during HLS %s recovery', async (type) => {
    const { hls, error } = await start();
    const operation = type === 'media' ? hls.recoverMediaError : hls.loadSource;
    operation.mockImplementationOnce(() => {
      throw new Error('recovery failed');
    });
    hls.fail(type);
    await vi.advanceTimersByTimeAsync(400);
    expect(error).toHaveBeenCalledExactlyOnceWith('HLS 重连失败，请重新解析');
    expect(hls.destroy).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not create a player if a native error fails the session during import', async () => {
    const video = new FakeVideo();
    const error = vi.fn();
    cleanup = attachPlayback(video as unknown as HTMLVideoElement, playback, {
      isUserPaused: () => false,
      onError: error,
    });
    video.error = { code: 3 };
    video.dispatchEvent(new Event('error'));
    await vi.dynamicImportSettled();
    expect(error).toHaveBeenCalledOnce();
    expect(mocks.FakeHls.instances).toHaveLength(0);
    expect(video.play).not.toHaveBeenCalled();
  });

  it('deduplicates native decode errors and HLS errors in the same recovery window', async () => {
    const { video, hls, error, recovering } = await start();
    video.error = { code: 3 };
    video.dispatchEvent(new Event('error'));
    hls.fail('media');
    await vi.advanceTimersByTimeAsync(400);
    expect(hls.recoverMediaError).toHaveBeenCalledTimes(1);
    expect(recovering).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  });

  it('recovers native FLV decode errors without requiring a second library event', async () => {
    const { video, error } = await start(false, 'flv');
    video.error = { code: 3 };
    video.dispatchEvent(new Event('error'));
    await vi.advanceTimersByTimeAsync(400);
    expect(mocks.createFlv).toHaveBeenCalledTimes(2);
    expect(error).not.toHaveBeenCalled();
  });

  it('bounds repeated fatal media recovery as well as network recovery', async () => {
    const { hls, error } = await start();
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      hls.fail('media');
      await vi.advanceTimersByTimeAsync(400 * attempt);
    }
    hls.fail('media');
    expect(hls.recoverMediaError).toHaveBeenCalledTimes(3);
    expect(hls.destroy).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('stops after three retries even when every manifest parses successfully', async () => {
    const { hls, error } = await start();
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      hls.fail();
      await vi.advanceTimersByTimeAsync(400 * attempt);
    }
    hls.fail();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(hls.loadSource).toHaveBeenCalledTimes(4);
    expect(hls.destroy).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledExactlyOnceWith('HLS 播放失败，请重新解析');
  });

  it('replenishes the retry budget only after sustained media progress', async () => {
    const { hls, video, error } = await start();
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      hls.fail();
      await vi.advanceTimersByTimeAsync(400 * attempt);
    }
    video.advance(20);
    video.advance(30);
    hls.fail();
    await vi.advanceTimersByTimeAsync(400);
    expect(hls.loadSource).toHaveBeenCalledTimes(5);
    expect(error).not.toHaveBeenCalled();
  });

  it('does not resume a user-paused video after manifest reloads', async () => {
    const { hls, video } = await start(true);
    hls.fail();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(video.play).not.toHaveBeenCalled();
  });

  it('cancels recovery and autoplay timers on disposal', async () => {
    const { hls, video } = await start();
    hls.fail();
    const playCalls = video.play.mock.calls.length;
    cleanup?.();
    cleanup = undefined;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(hls.loadSource).toHaveBeenCalledTimes(1);
    expect(hls.destroy).toHaveBeenCalledTimes(1);
    expect(video.play).toHaveBeenCalledTimes(playCalls);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not attach a player after disposal during an asynchronous import', async () => {
    const video = new FakeVideo();
    const dispose = attachPlayback(video as unknown as HTMLVideoElement, playback, {
      isUserPaused: () => false,
      onError: vi.fn(),
    });
    dispose();
    await vi.dynamicImportSettled();
    expect(mocks.FakeHls.instances).toHaveLength(0);
    expect(video.play).not.toHaveBeenCalled();
  });

  it.each(['error', 'complete'])('reconnects FLV on %s and bounds retries', async (event) => {
    const { error, recovering } = await start(false, 'flv');
    const emit = (): void => {
      const handler = [...mocks.flv.on.mock.calls].reverse().find(([name]) => name === event)?.[1];
      handler?.();
    };
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      emit();
      emit(); // 重复事件不能同时创建多个连接。
      await vi.advanceTimersByTimeAsync(400 * attempt);
    }
    expect(mocks.createFlv).toHaveBeenCalledTimes(4);
    expect(recovering).toHaveBeenCalledTimes(3);
    emit();
    expect(error).toHaveBeenCalledExactlyOnceWith('FLV 播放失败，请尝试重新解析');
  });

  it('cancels pending FLV reconnect when the room closes', async () => {
    await start(false, 'flv');
    mocks.flv.on.mock.calls.find(([event]) => event === 'error')?.[1]();
    cleanup?.();
    cleanup = undefined;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(mocks.createFlv).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps a user pause across FLV reconnects', async () => {
    const { video } = await start(true, 'flv');
    mocks.flv.on.mock.calls.find(([event]) => event === 'error')?.[1]();
    await vi.advanceTimersByTimeAsync(400);
    expect(mocks.createFlv).toHaveBeenCalledTimes(2);
    expect(video.play).not.toHaveBeenCalled();
  });

  it('initializes only FLV for an FLV source and releases it on disposal', async () => {
    await start(false, 'flv');
    expect(mocks.FakeHls.instances).toHaveLength(0);
    expect(mocks.createFlv).toHaveBeenCalledTimes(1);
    cleanup?.();
    cleanup = undefined;
    expect(mocks.flv.unload).toHaveBeenCalledTimes(1);
    expect(mocks.flv.detachMediaElement).toHaveBeenCalledTimes(1);
    expect(mocks.flv.destroy).toHaveBeenCalledTimes(1);
  });
});
