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
  /** HTTPS room cover, when the platform follow API provides one. */
  cover?: string | undefined;
}
