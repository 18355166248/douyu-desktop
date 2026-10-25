import type { StreamPlatform } from './stream';

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
  platform: StreamPlatform;
  roomId: string;
  metrics: RoomAudienceMetric[];
  fetchedAt: number;
}
