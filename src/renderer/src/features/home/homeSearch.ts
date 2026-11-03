import type { RoomSearchItem } from '@shared/contracts/search';

/** 搜索结果的完整说明：命中来源、粉丝数、分区和轮播状态，用作 title/aria 文本。 */
export function searchRoomMeta(item: RoomSearchItem): string {
  const parts: string[] = [item.match === 'anchor' ? '主播' : '直播间'];
  if (item.fansText) parts.push(`粉丝 ${item.fansText}`);
  if (item.category) parts.push(item.category);
  if (item.hasVideo && !item.isLive) parts.push('录像轮播');
  return parts.join(' · ');
}

/** 下拉行右侧的紧凑说明：粉丝数最能区分同名主播，没有就退回分区。 */
export function searchRoomSideText(item: RoomSearchItem): string | undefined {
  if (item.fansText) return `${item.fansText} 粉丝`;
  return item.category;
}

/** 下拉里最多展示多少行；更多结果靠继续输入缩小范围。 */
export const MAX_SEARCH_ROWS = 10;

/**
 * 下拉里上下移动高亮的纯逻辑：-1 表示还没选中任何行，
 * 第一次按向下选中第一行、按向上选中最后一行，之后循环。
 */
export function stepSearchHighlight(current: number, step: 1 | -1, total: number): number {
  if (total <= 0) return -1;
  if (current < 0) return step === 1 ? 0 : total - 1;
  return (current + step + total) % total;
}
