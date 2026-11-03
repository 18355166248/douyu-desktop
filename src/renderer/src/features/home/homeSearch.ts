import type { RoomSearchItem } from '@shared/contracts/search';
import type { StreamPlatform } from '@shared/contracts/stream';
import { roomKey } from '../../lib/streamIdentity';

interface KeyedRoom {
  platform: StreamPlatform;
  roomId: string;
}

/**
 * 搜索结果里去掉页面上已经展示过的房间（当前查询命中的关注/特别关注），
 * 避免同一房间在「搜索结果」和「我的关注」里重复出现。
 */
export function excludeKnownRooms<T extends KeyedRoom>(
  items: readonly RoomSearchItem[],
  known: readonly T[],
): RoomSearchItem[] {
  if (known.length === 0) return [...items];
  const keys = new Set(known.map((room) => roomKey(room.platform, room.roomId)));
  return items.filter((item) => !keys.has(roomKey(item.platform, item.roomId)));
}

/** 搜索结果的副标题：命中来源、粉丝数和分区。 */
export function searchRoomMeta(item: RoomSearchItem): string | undefined {
  const parts: string[] = [item.match === 'anchor' ? '主播' : '直播间'];
  if (item.fansText) parts.push(`粉丝 ${item.fansText}`);
  if (item.category) parts.push(item.category);
  if (item.hasVideo && !item.isLive) parts.push('录像轮播');
  return parts.join(' · ');
}
