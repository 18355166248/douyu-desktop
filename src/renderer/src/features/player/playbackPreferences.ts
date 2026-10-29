import { z } from 'zod';
import type { StreamPlatform, StreamQuality } from '@shared/contracts/stream';
import { defaultQuality } from './streamQuality';
import { getRoomPreference, readStored, writeStored } from './viewingStorage';
import type { AddStreamOptions } from './useStreamGrid';

const KEY = 'douyu-desktop.playback-preferences.v1';
const schema = z.object({
  balancedQuality: z.boolean().default(false),
  muteNewRooms: z.boolean().default(false),
  volume: z.number().min(0).max(1).default(1),
});
export type PlaybackPreferences = z.infer<typeof schema>;
export function loadPlaybackPreferences(): PlaybackPreferences {
  const parsed = schema.safeParse(readStored(KEY));
  return parsed.success ? parsed.data : schema.parse({});
}
export function savePlaybackPreferences(value: PlaybackPreferences): boolean {
  return writeStored(KEY, schema.parse(value));
}
export function preferredQuality(platform: StreamPlatform, secondary: boolean): StreamQuality {
  if (!secondary) return defaultQuality(platform);
  if (platform === 'douyu') return '3';
  if (platform === 'bilibili') return '150';
  // 虎牙当前只有一个可用档位，不虚构低画质能力。
  return '2000';
}
export function newRoomOptions(
  platform: StreamPlatform,
  roomId: string,
  secondary: boolean,
): AddStreamOptions {
  const preferences = loadPlaybackPreferences();
  const saved = getRoomPreference(platform, roomId);
  // 单房间记忆优先于默认画质/音量；默认静音是防止新增房间突然出声的显式偏好。
  // 组合恢复直接使用组合配置，不经过这里。
  return {
    quality: preferredQuality(platform, preferences.balancedQuality && secondary),
    preferHls: false,
    // 短号首次解析前还不知道真实房间号，默认音量留到解析后再作为最终兜底。
    defaultVolume: preferences.volume,
    ...saved,
    platform,
    roomId,
    ...(preferences.muteNewRooms ? { muted: true } : {}),
  };
}
