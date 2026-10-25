import type { StreamPlatform } from '@shared/contracts/stream';

export function roomKey(platform: StreamPlatform, roomId: string): string {
  return `${platform}:${roomId}`;
}

export function streamKey(playback: Pick<{ platform: StreamPlatform; roomId: string }, 'platform' | 'roomId'>): string {
  return roomKey(playback.platform, playback.roomId);
}

export function platformLabel(platform: StreamPlatform): string {
  switch (platform) {
    case 'bilibili':
      return 'B站';
    case 'huya':
      return '虎牙';
    default:
      return '斗鱼';
  }
}
