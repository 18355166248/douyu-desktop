import type { StreamPlatform } from './stream';
import type { RoomPkSnapshot } from './pk';

export interface RoomAudienceInput {
  platform: StreamPlatform;
  roomId: string;
}

export interface RoomAudienceMetric {
  key: string;
  label: string;
  /** null means the platform did not provide a usable value; it is never treated as zero. */
  value: number | null;
  /** The platform caps this count (for example, 9999+). */
  isLowerBound?: boolean;
  unit: '人' | '分' | '热度' | '次';
  description?: string;
}

export interface RoomAudienceSnapshot {
  pk?: RoomPkSnapshot;
  platform: StreamPlatform;
  roomId: string;
  metrics: RoomAudienceMetric[];
  rankings?: RoomAudienceRanking[];
  fetchedAt: number;
}

export interface RoomAudienceRankEntry {
  rank: number;
  userId: string;
  nickname: string;
  contribution: number | null;
}

export interface RoomAudienceRanking {
  key: 'day' | 'week' | 'total';
  label: string;
  entries: RoomAudienceRankEntry[];
  updatedAt: number;
}

export interface DouyuAudienceUpdate {
  roomId: string;
  metrics?: RoomAudienceMetric[];
  ranking?: RoomAudienceRanking;
}
