import type { DanmakuMessage } from '@shared/contracts/danmaku';
import type { DanmakuSettings } from './danmakuSettings';

export type GiftTier = 'small' | 'large';

/** Name-based fallback: Douyu `dgb` does not expose a stable price field. */
const LARGE_GIFT_KEYWORDS = [
  '火箭',
  '飞机',
  '嘉年华',
  '城堡',
  '宇宙飞船',
  '钻石',
  '浪漫小电视',
  '魔法书',
  '天空之城',
  '游艇',
  '跑车',
  '神灯',
  '阿拉丁',
  '超级',
  '守护',
] as const;

const LARGE_GIFT_COUNT = 50;

export function giftTier(event: Pick<DanmakuMessage, 'giftName' | 'giftCount'>): GiftTier {
  const name = (event.giftName ?? '').replace(/\s+/g, '');
  const count = Math.max(1, event.giftCount ?? 1);
  if (count >= LARGE_GIFT_COUNT) return 'large';
  if (LARGE_GIFT_KEYWORDS.some((keyword) => name.includes(keyword))) return 'large';
  return 'small';
}

export function giftVisible(tier: GiftTier, settings: DanmakuSettings): boolean {
  if (!settings.showGift) return false;
  return tier === 'large' ? settings.showLargeGift : settings.showSmallGift;
}
