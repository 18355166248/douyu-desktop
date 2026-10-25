import { describe, expect, it } from 'vitest';
import type { HuYaMessage } from 'huya-danma-listener';
import { toHuyaEvent } from './HuyaDanmakuSession';

function chat(overrides: Partial<HuYaMessage & { type: 'chat' }> = {}): HuYaMessage {
  return {
    type: 'chat',
    time: 1_700_000_000_000,
    from: { name: '虎牙观众', rid: '42' },
    id: 'chat-id',
    content: '你好',
    color: '#ff0000',
    ...overrides,
  };
}

describe('toHuyaEvent', () => {
  it('maps a chat message to the shared danmaku event', () => {
    expect(toHuyaEvent('660000', chat())).toEqual({
      platform: 'huya',
      roomId: '660000',
      kind: 'chat',
      userId: '42',
      nickname: '虎牙观众',
      text: '你好',
      color: '#ff0000',
      level: 0,
      id: 'chat-id',
      timestamp: 1_700_000_000_000,
    });
  });

  it('falls back to a safe color and skips empty chat text', () => {
    expect(toHuyaEvent('660000', chat({ color: 'red' }))?.color).toBe('#ffffff');
    expect(toHuyaEvent('660000', chat({ content: '   ' }))).toBeNull();
  });

  it('ignores online messages that have no sender fields', () => {
    expect(toHuyaEvent('660000', { type: 'online', time: 1_700_000_000_002, count: 100 })).toBeNull();
  });

  it('maps a gift message and keeps the gift metadata', () => {
    const gift: HuYaMessage = {
      type: 'gift',
      time: 1_700_000_000_001,
      from: { name: '送礼人', rid: '7' },
      id: 'gift-id',
      name: '荧光棒',
      count: 3,
      price: 300,
      earn: 3,
    };

    expect(toHuyaEvent('660000', gift)).toMatchObject({
      platform: 'huya',
      kind: 'gift',
      userId: '7',
      nickname: '送礼人',
      text: '送出 3 个 荧光棒',
      giftName: '荧光棒',
      giftCount: 3,
    });
  });
});
