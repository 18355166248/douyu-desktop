import { useQuery } from '@tanstack/react-query';
import type { StreamPlatform } from '@shared/contracts/stream';
import { unwrap } from '../../lib/api';

export const roomLiveStatusKey = (platform: StreamPlatform, roomId: string) =>
  ['room-live-status', platform, roomId] as const;

/**
 * A room's start time only changes when the anchor restarts, so a one-minute
 * refresh is enough for the badge to follow a restart without extra traffic.
 */
export function useRoomLiveStatus(platform: StreamPlatform, roomId: string) {
  return useQuery({
    queryKey: roomLiveStatusKey(platform, roomId),
    queryFn: async () =>
      unwrap(await window.api.streams.liveStatus({ platform, roomId })),
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
