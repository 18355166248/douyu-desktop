import type { FollowedRoom } from '@shared/contracts/follow';
import type { RoomHistoryEntry } from '@shared/contracts/history';
import type {
  SpecialFollowEntry,
  SpecialFollowTarget,
} from '@shared/contracts/specialFollow';

export interface SpecialRoom extends SpecialFollowEntry {
  isLive: boolean;
  heat: number;
}

export function specialFollowKey(
  target: Pick<SpecialFollowTarget, 'platform' | 'roomId'>,
): string {
  return `${target.platform}:${target.roomId}`;
}

/** Hottest first; live state and name only break ties. */
export function sortFollowedRooms(rooms: readonly FollowedRoom[]): FollowedRoom[] {
  return [...rooms].sort((left, right) => {
    if (right.heat !== left.heat) return right.heat - left.heat;
    if (left.isLive !== right.isLive) return left.isLive ? -1 : 1;
    return left.name.localeCompare(right.name, 'zh-CN');
  });
}

/** Combines pinned metadata with the fresh live state from the follow list. */
export function resolveSpecialRooms(
  entries: readonly SpecialFollowEntry[],
  followed: readonly FollowedRoom[],
): SpecialRoom[] {
  const followMap = new Map(followed.map((room) => [specialFollowKey(room), room]));
  return entries.map((entry) => {
    const fresh = followMap.get(specialFollowKey(entry));
    return {
      ...entry,
      name: fresh?.name ?? entry.name,
      title: fresh?.title ?? entry.title,
      ...(fresh?.cover ? { cover: fresh.cover } : {}),
      isLive: fresh?.isLive ?? false,
      heat: fresh?.heat ?? 0,
    };
  });
}

export function targetFromFollowed(room: FollowedRoom): SpecialFollowTarget {
  return {
    platform: room.platform,
    roomId: room.roomId,
    name: room.name,
    title: room.title,
    ...(room.cover ? { cover: room.cover } : {}),
  };
}

export function targetFromHistory(
  entry: RoomHistoryEntry,
  cover?: string | undefined,
): SpecialFollowTarget {
  return {
    platform: entry.platform,
    roomId: entry.roomId,
    name: entry.anchorName || `房间 ${entry.roomId}`,
    title: entry.title || `房间 ${entry.roomId}`,
    ...(cover ? { cover } : {}),
  };
}
