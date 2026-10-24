export type DouyuQuality = '0' | '3' | '4' | '8';

export interface ResolveStreamInput {
  roomId: string;
  quality?: DouyuQuality | undefined;
  preferHls?: boolean | undefined;
}

export type StreamFormat = 'hls' | 'flv';

export interface StreamPlayback {
  platform: 'douyu' | 'bilibili' | 'huya';
  roomId: string;
  title: string;
  anchorName: string;
  url: string;
  format: StreamFormat;
  quality: string;
  expiresAt?: number;
}
