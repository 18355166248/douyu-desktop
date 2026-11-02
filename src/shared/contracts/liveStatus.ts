import type { StreamPlatform } from './stream';

export interface RoomLiveStatusInput {
  platform: StreamPlatform;
  roomId: string;
}

/**
 * Live state plus the start of the current session, used to show how long the
 * stream has been running. Fields stay `null` when the platform answer is not
 * usable, so the UI can hide the badge instead of guessing.
 */
export interface RoomLiveStatus {
  platform: StreamPlatform;
  roomId: string;
  /** `true` 正在直播；`false` 未开播；`null` 本次没拿到可用状态。 */
  live: boolean | null;
  /** 本次开播时间（epoch ms）；未开播或平台未给出时为 null。 */
  liveSince: number | null;
  fetchedAt: number;
}
