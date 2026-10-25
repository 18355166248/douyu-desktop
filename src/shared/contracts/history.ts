import type { StreamPlatform } from './stream';

export const MAX_ROOM_HISTORY = 30;

export interface RoomHistoryEntry {
  platform: StreamPlatform;
  roomId: string;
  title: string;
  anchorName: string;
  /** Epoch milliseconds of the most recent visit. */
  visitedAt: number;
  /** Room cover captured when the room was opened. */
  cover?: string | undefined;
}
