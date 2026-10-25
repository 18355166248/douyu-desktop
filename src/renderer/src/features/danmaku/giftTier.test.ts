import { describe, expect, it } from 'vitest';
import { DEFAULT_DANMAKU_SETTINGS } from './danmakuSettings';
import { giftTier, giftVisible } from './giftTier';

describe('gift tier', () => {
  it('classifies high-value names and large combos as large', () => {
    expect(giftTier({ giftName: '火箭', giftCount: 1 })).toBe('large');
    expect(giftTier({ giftName: '超级火箭', giftCount: 1 })).toBe('large');
    expect(giftTier({ giftName: '阿拉丁神灯', giftCount: 20 })).toBe('large');
    expect(giftTier({ giftName: '荧光棒', giftCount: 1 })).toBe('small');
    expect(giftTier({ giftName: '荧光棒', giftCount: 50 })).toBe('large');
    expect(giftTier({ giftName: undefined, giftCount: undefined })).toBe('small');
  });

  it('applies the global and per-tier filters', () => {
    const settings = DEFAULT_DANMAKU_SETTINGS;
    expect(giftVisible('small', settings)).toBe(true);
    expect(giftVisible('large', settings)).toBe(true);
    expect(giftVisible('small', { ...settings, showSmallGift: false })).toBe(false);
    expect(giftVisible('large', { ...settings, showLargeGift: false })).toBe(false);
    expect(giftVisible('large', { ...settings, showGift: false })).toBe(false);
  });
});
