import type { StreamPlatform } from './stream';

/** Hard cap for the home followed-room list; the API can paginate much further. */
export const MAX_FOLLOWED_ROOMS = 100;

export interface FollowedRoom {
  platform: StreamPlatform;
  roomId: string;
  /** Anchor nickname. */
  name: string;
  /** Room title. */
  title: string;
  isLive: boolean;
  /** Douyu's official "特别关注" flag. */
  isSpecial: boolean;
  /** Douyu marks this room as a recorded video loop, live or offline. */
  hasVideo: boolean;
  /** Raw popularity from the follow list, normalized across 万/亿 units. */
  heat: number;
  /** HTTPS room cover, when the platform follow API provides one. */
  cover?: string | undefined;
}
