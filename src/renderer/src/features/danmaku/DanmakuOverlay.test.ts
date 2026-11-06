import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DanmakuEvent } from '@shared/contracts/danmaku';
import { DanmakuOverlay } from './DanmakuOverlay';

const host = vi.hoisted(() => ({
  effects: [] as Array<() => unknown>,
  deps: [] as unknown[][],
  effectCursor: 0,
  refCursor: 0,
  refs: [] as Array<{ current: unknown }>,
  event: undefined as ((event: DanmakuEvent) => void) | undefined,
  engine: {
    push: vi.fn(),
    clear: vi.fn(),
    clearQueue: vi.fn(),
    updateSettings: vi.fn(),
    destroy: vi.fn(),
  },
  gifts: { push: vi.fn(), clear: vi.fn() },
}));
vi.mock('react', () => {
  const effect = (callback: () => unknown, deps: unknown[]) => {
    const index = host.effectCursor++;
    const previous = host.deps[index];
    if (previous && deps.every((dep, i) => Object.is(dep, previous[i]))) return;
    host.deps[index] = deps;
    host.effects.push(callback);
  };
  return {
    useRef: (current: unknown) => {
      const index = host.refCursor++;
      host.refs[index] ??= { current };
      return host.refs[index];
    },
    useEffect: effect,
    useLayoutEffect: effect,
  };
});
vi.mock('./DanmakuEngine', () => ({
  DanmakuEngine: class {
    constructor() {
      return host.engine;
    }
  },
}));
vi.mock('./GiftFeed', () => ({ GiftFeed: () => null }));
vi.mock('./DanmakuSettingsContext', () => ({
  useDanmakuSettings: () => ({ settings: { visible: true }, clearToken: 0 }),
}));
vi.mock('./useDanmaku', () => ({
  useDanmaku: (_room: string, _platform: string, event: typeof host.event) => {
    host.event = event;
    return { status: 'connected' };
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  host.effects = [];
  host.refs = [];
  host.deps = [];
});
function mount(suspended: boolean, reconnectToken = 0) {
  host.effectCursor = 0;
  host.refCursor = 0;
  host.effects = [];
  DanmakuOverlay({ reconnectToken, roomId: '1', platform: 'douyu', suspended });
  host.refs[0]!.current = {};
  host.refs[2]!.current = host.gifts;
  for (const effect of host.effects) effect();
}
describe('danmaku playback gating', () => {
  it('reconnects without destroying the engine, active animations or displayed gifts', () => {
    mount(false);
    vi.clearAllMocks();
    mount(false, 1);
    expect(host.engine.clearQueue).toHaveBeenCalledOnce();
    expect(host.engine.clear).not.toHaveBeenCalled();
    expect(host.engine.destroy).not.toHaveBeenCalled();
    expect(host.gifts.clear).not.toHaveBeenCalled();
    const fresh = { kind: 'chat' } as DanmakuEvent;
    host.event?.(fresh);
    expect(host.engine.push).toHaveBeenCalledWith(fresh);
  });
  it('clears and discards messages while playback is unavailable', () => {
    mount(true);
    host.event?.({ kind: 'chat' } as DanmakuEvent);
    host.event?.({ kind: 'gift' } as DanmakuEvent);
    expect(host.engine.push).not.toHaveBeenCalled();
    expect(host.gifts.push).not.toHaveBeenCalled();
    expect(host.engine.clear).toHaveBeenCalled();
    expect(host.gifts.clear).toHaveBeenCalledOnce();
    expect(host.engine.updateSettings).toHaveBeenCalledWith({ visible: false });
  });
  it('starts with empty queues and accepts fresh messages once playing', () => {
    mount(false);
    const chat = { kind: 'chat' } as DanmakuEvent;
    const gift = { kind: 'gift' } as DanmakuEvent;
    host.event?.(chat);
    host.event?.(gift);
    expect(host.engine.push).toHaveBeenCalledExactlyOnceWith(chat);
    expect(host.gifts.push).toHaveBeenCalledExactlyOnceWith(gift);
    expect(host.gifts.clear).toHaveBeenCalledOnce();
  });
});
