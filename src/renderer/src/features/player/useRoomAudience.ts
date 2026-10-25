import { useQuery } from '@tanstack/react-query';
import type { StreamPlatform } from '@shared/contracts/stream';
import { unwrap } from '../../lib/api';

export const roomAudienceKey = (platform: StreamPlatform, roomId: string) =>
  ['room-audience', platform, roomId] as const;

export function useRoomAudience(platform: StreamPlatform, roomId: string) {
  return useQuery({
    queryKey: roomAudienceKey(platform, roomId),
    queryFn: async () => unwrap(await window.api.streams.audience({ platform, roomId })),
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
