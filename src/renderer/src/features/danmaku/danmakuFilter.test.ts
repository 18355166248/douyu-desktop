import { describe, expect, it } from 'vitest';
import type { DanmakuEvent } from '@shared/contracts/danmaku';
import { shouldRenderDanmaku } from './danmakuFilter';
import { DEFAULT_DANMAKU_SETTINGS } from './danmakuSettings';

const chat: DanmakuEvent = {
  id: 'chat-1',
  timestamp: 0,
  platform: 'douyu',
  roomId: '9999',
  kind: 'chat',
  userId: '1',
  nickname: 'Alice',
  text: 'hello',
  color: '#ffffff',
  level: 10,
  hasDms: true,
  position: 'scroll',
};

const settings = (patch: Partial<typeof DEFAULT_DANMAKU_SETTINGS>) => ({
  ...DEFAULT_DANMAKU_SETTINGS,
  ...patch,
});

describe('danmaku filtering', () => {
  it('renders ordinary chat and removes it when simplified without dms', () => {
    expect(shouldRenderDanmaku(chat, settings({}))).toBe(true);
    expect(shouldRenderDanmaku({ ...chat, hasDms: false }, settings({ simplified: true }))).toBe(
      false,
    );
    expect(shouldRenderDanmaku({ ...chat, hasDms: false }, settings({}))).toBe(true);
  });

  it('supports role, large, super and fixed-position blocks', () => {
    expect(shouldRenderDanmaku({ ...chat, isNoble: true }, settings({ blockRole: true }))).toBe(
      false,
    );
    expect(shouldRenderDanmaku({ ...chat, level: 30 }, settings({ blockLarge: true }))).toBe(false);
    expect(shouldRenderDanmaku({ ...chat, isSuper: true }, settings({ blockSuper: true }))).toBe(
      false,
    );
    expect(shouldRenderDanmaku({ ...chat, position: 'top' }, settings({ blockTop: true }))).toBe(
      false,
    );
    expect(
      shouldRenderDanmaku({ ...chat, position: 'bottom' }, settings({ blockBottom: true })),
    ).toBe(false);
    expect(shouldRenderDanmaku({ ...chat, position: 'scroll' }, settings({ blockTop: true }))).toBe(
      true,
    );
  });

  it('honors enter and gift visibility switches', () => {
    const enter: DanmakuEvent = { ...chat, id: 'enter-1', kind: 'enter', text: '进入了直播间' };
    const gift: DanmakuEvent = { ...chat, id: 'gift-1', kind: 'gift', text: '送出 火箭 × 1' };

    expect(shouldRenderDanmaku(enter, settings({ showEnter: false }))).toBe(false);
    expect(shouldRenderDanmaku(gift, settings({ showGift: false }))).toBe(false);
    expect(shouldRenderDanmaku(enter, settings({ showEnter: true }))).toBe(true);
    expect(shouldRenderDanmaku(gift, settings({ showGift: true }))).toBe(true);
  });
});
