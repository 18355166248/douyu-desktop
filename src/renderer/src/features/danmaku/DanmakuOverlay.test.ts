import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DanmakuEvent } from '@shared/contracts/danmaku';
import { DanmakuOverlay } from './DanmakuOverlay';

const host = vi.hoisted(() => ({
  effects: [] as Array<() => unknown>,
  refs: [] as Array<{ current: unknown }>,
  event: undefined as ((event: DanmakuEvent) => void) | undefined,
  engine: { push: vi.fn(), clear: vi.fn(), updateSettings: vi.fn(), destroy: vi.fn() },
  gifts: { push: vi.fn(), clear: vi.fn() },
}));
vi.mock('react', () => ({
  useRef: (current: unknown) => {
    const ref = { current };
    host.refs.push(ref);
    return ref;
  },
  useEffect: (effect: () => unknown) => host.effects.push(effect),
  useLayoutEffect: (effect: () => unknown) => host.effects.push(effect),
}));
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
});
function mount(suspended: boolean) {
  DanmakuOverlay({ roomId: '1', platform: 'douyu', suspended });
  host.refs[0]!.current = {};
  host.refs[2]!.current = host.gifts;
  for (const effect of host.effects) effect();
}
describe('danmaku playback gating', () => {
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
