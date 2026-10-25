export type DouyuQuality = '0' | '3' | '4' | '8';
export type BilibiliQuality = '80' | '150' | '250' | '400' | '10000';
export type HuyaQuality = '2000';
export type StreamQuality = DouyuQuality | BilibiliQuality | HuyaQuality;
export type StreamPlatform = 'douyu' | 'bilibili' | 'huya';

export interface ResolveStreamInput {
  roomId: string;
  platform?: StreamPlatform | undefined;
  quality?: StreamQuality | undefined;
  preferHls?: boolean | undefined;
}

export type StreamFormat = 'hls' | 'flv';

export interface StreamPlayback {
  platform: StreamPlatform;
  roomId: string;
  title: string;
  anchorName: string;
  url: string;
  format: StreamFormat;
  quality: string;
  expiresAt?: number;
}
