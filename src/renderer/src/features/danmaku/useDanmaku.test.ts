import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DanmakuPlatform } from '@shared/contracts/danmaku';
import { useDanmaku } from './useDanmaku';

const host = vi.hoisted(() => ({
  effect: undefined as (() => (() => void) | undefined) | undefined,
  status: vi.fn(),
  connect: vi.fn(),
  close: vi.fn(),
}));
vi.mock('react', () => ({
  useRef: (current: unknown) => ({ current }),
  useState: (initial: unknown) => [initial, host.status],
  useEffect: (effect: typeof host.effect) => {
    host.effect = effect;
  },
}));
vi.mock('./BilibiliDanmakuClient', () => ({
  BilibiliDanmakuClient: class {
    connect = host.connect;
    close = host.close;
  },
}));
vi.mock('./douyuDanmakuClient', () => ({
  DouyuDanmakuClient: class {
    connect = host.connect;
    close = host.close;
  },
}));

const config = vi.fn();
const huyaStop = vi.fn();
const unsubscribe = vi.fn();
let cleanup: (() => void) | undefined;
function mount(platform: DanmakuPlatform): void {
  // eslint-disable-next-line react-hooks/rules-of-hooks -- deterministic hook host.
  useDanmaku('1', platform, vi.fn());
  cleanup = host.effect?.();
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  config.mockReset();
  huyaStop.mockResolvedValue({ ok: true, data: null });
  vi.stubGlobal('window', {
    api: {
      danmaku: {
        bilibiliConfig: config,
        douyuConfig: config,
        huyaStart: config,
        huyaStop,
        onHuyaUpdate: () => unsubscribe,
      },
    },
  });
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  expect(vi.getTimerCount()).toBe(0);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('initial danmaku subscription recovery', () => {
  it.each(['douyu', 'bilibili', 'huya'] as const)(
    'retries %s config/start failures and stops retrying after success',
    async (platform) => {
      config.mockRejectedValueOnce(new Error('network')).mockResolvedValue({
        ok: true,
        data: platform === 'huya' ? 'subscription' : { host: 'example.test', token: 'token' },
      });
      mount(platform);
      await vi.advanceTimersByTimeAsync(0);
      expect(host.status).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'reconnecting' }),
      );
      await vi.advanceTimersByTimeAsync(1_000);
      expect(config).toHaveBeenCalledTimes(2);
      if (platform !== 'huya') expect(host.connect).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(config).toHaveBeenCalledTimes(2);
      cleanup?.();
      cleanup = undefined;
      if (platform === 'huya') expect(huyaStop).toHaveBeenCalledWith('subscription');
      else expect(host.close).toHaveBeenCalledOnce();
    },
  );

  it('limits retries and leaves an error for manual reconnect', async () => {
    config.mockResolvedValue({ ok: false, error: { code: 'UPSTREAM', message: 'offline' } });
    mount('bilibili');
    await vi.advanceTimersByTimeAsync(12_000);
    expect(config).toHaveBeenCalledTimes(4);
    expect(host.status).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'error', message: 'offline' }),
    );
    expect(host.connect).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels a pending retry on unmount', async () => {
    config.mockRejectedValue(new Error('offline'));
    mount('douyu');
    await vi.advanceTimersByTimeAsync(0);
    cleanup?.();
    cleanup = undefined;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(config).toHaveBeenCalledOnce();
  });

  it.each(['douyu', 'bilibili', 'huya'] as const)(
    'discards a late %s result after unmount',
    async (platform) => {
      let finish!: (result: unknown) => void;
      config.mockReturnValue(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      mount(platform);
      cleanup?.();
      cleanup = undefined;
      host.status.mockClear();
      finish({
        ok: true,
        data: platform === 'huya' ? 'late' : { host: 'example.test', token: 'token' },
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(host.connect).not.toHaveBeenCalled();
      expect(host.status).not.toHaveBeenCalled();
      if (platform === 'huya') expect(huyaStop).toHaveBeenCalledWith('late');
    },
  );
});
