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
  vi.stubGlobal('document', { visibilityState: 'visible' });
  hooks.effects = [];
  hooks.setStalled.mockClear();
});
afterEach(() => {
  cleanup?.();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
function StallHarness() {
  let frame: (() => void) | undefined;
  const video = {
    currentTime: 0,
    paused: false,
    ended: false,
    seeking: false,
    requestVideoFrameCallback: vi.fn((callback: () => void) => {
      frame = callback;
      return 1;
    }),
    cancelVideoFrameCallback: vi.fn(),
  };
  const state = useStreamStall({ current: video as unknown as HTMLVideoElement }, true);
  cleanup = hooks.effects[0]?.();
  return { video, state, frame: () => frame?.() };
}

describe('video frame stall detection', () => {
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
