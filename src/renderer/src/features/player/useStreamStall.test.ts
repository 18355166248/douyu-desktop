import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStreamStall } from './useStreamStall';

const hooks = vi.hoisted(() => ({
  effects: [] as Array<() => (() => void) | undefined>,
  setStalled: vi.fn(),
}));
vi.mock('react', () => ({
  useRef: (current: unknown) => ({ current }),
  useState: () => [false, hooks.setStalled],
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => (() => void) | undefined) => hooks.effects.push(effect),
}));
let cleanup: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
  hooks.effects = [];
  hooks.setStalled.mockClear();
});
afterEach(() => {
  cleanup?.();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function StallHarness(userPausedRef?: { current: boolean }, observeFrames = true) {
  let frame: (() => void) | undefined;
  const video = Object.assign(new EventTarget(), {
    currentTime: 0,
    readyState: 4,
    paused: false,
    ended: false,
    seeking: false,
    requestVideoFrameCallback: vi.fn((callback: () => void) => {
      frame = callback;
      return 1;
    }),
    cancelVideoFrameCallback: vi.fn(),
  });
  const state = useStreamStall(
    { current: video as unknown as HTMLVideoElement },
    true,
    userPausedRef,
    observeFrames,
  );
  cleanup = hooks.effects[0]?.();
  return { video, state, frame: () => frame?.() };
}

describe('video frame stall detection', () => {
  it('uses media progress for a hidden workspace and still detects a genuinely stopped stream', () => {
    const { video } = StallHarness({ current: false }, false);
    expect(video.requestVideoFrameCallback).not.toHaveBeenCalled();
    for (let i = 1; i <= 10; i += 1) {
      video.currentTime = i;
      vi.advanceTimersByTime(1_000);
    }
    expect(hooks.setStalled).not.toHaveBeenCalledWith(true);
    vi.advanceTimersByTime(8_000);
    expect(hooks.setStalled).toHaveBeenLastCalledWith(true);
  });
  it('gives a restored window a fresh observation period when background timers were suspended', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    StallHarness({ current: false });
    Object.assign(document, { visibilityState: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    // Simulate elapsed wall time without delivering any background interval callbacks.
    now = 60_000;
    Object.assign(document, { visibilityState: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(1_000);
    expect(hooks.setStalled).not.toHaveBeenCalledWith(true);
    now += 8_000;
    vi.advanceTimersByTime(1_000);
    expect(hooks.setStalled).toHaveBeenLastCalledWith(true);
  });

  it('restarts observation immediately after resuming a user pause', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const userPaused = { current: true };
    const { video } = StallHarness(userPaused);
    now = 30_000;
    userPaused.current = false;
    video.dispatchEvent(new Event('play'));
    vi.advanceTimersByTime(1_000);
    expect(hooks.setStalled).not.toHaveBeenCalledWith(true);
  });
  it('recovers an initial load that never becomes ready, but respects explicit pause', () => {
    const userPaused = { current: false };
    const { video } = StallHarness(userPaused);
    video.readyState = 0;
    video.paused = true;
    vi.advanceTimersByTime(19_000);
    expect(hooks.setStalled).not.toHaveBeenCalledWith(true);
    vi.advanceTimersByTime(1_000);
    expect(hooks.setStalled).toHaveBeenLastCalledWith(true);
    userPaused.current = true;
    vi.advanceTimersByTime(1_000);
    expect(hooks.setStalled).toHaveBeenLastCalledWith(false);
  });
  it('detects frozen video while the audio clock continues advancing', () => {
    const { video } = StallHarness();
    for (let i = 1; i <= 8; i++) {
      video.currentTime = i;
      vi.advanceTimersByTime(1000);
    }
    expect(hooks.setStalled).toHaveBeenLastCalledWith(true);
  });
  it('allows waiting again after dismiss and clears on new frames', () => {
    const { state, video, frame } = StallHarness();
    vi.advanceTimersByTime(8000);
    state.dismiss();
    video.currentTime = 9;
    vi.advanceTimersByTime(1000);
    expect(hooks.setStalled).toHaveBeenLastCalledWith(false);
    frame();
    video.currentTime = 10;
    vi.advanceTimersByTime(1000);
    expect(hooks.setStalled).toHaveBeenLastCalledWith(false);
  });
  it('ignores user pause and cancels frame callbacks on cleanup', () => {
    const { video } = StallHarness();
    video.paused = true;
    vi.advanceTimersByTime(10000);
    expect(hooks.setStalled).not.toHaveBeenCalledWith(true);
    cleanup?.();
    cleanup = undefined;
    expect(video.cancelVideoFrameCallback).toHaveBeenCalledWith(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
