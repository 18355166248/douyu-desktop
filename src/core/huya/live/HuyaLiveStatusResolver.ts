import type { RoomLiveStatus } from '@shared/contracts/liveStatus';
import type { HttpClient } from '../../ports/HttpClient';

interface ProfileRoomResponse {
  status?: number | string;
  message?: string;
  data?: {
    liveStatus?: string;
    realLiveStatus?: string;
    liveData?: {
      startTime?: number | string;
    };
  };
}

function unknownStatus(roomId: string): RoomLiveStatus {
  return {
    platform: 'huya',
    roomId,
    live: null,
    liveSince: null,
    fetchedAt: Date.now(),
  };
}

/** Huya reports either seconds or milliseconds depending on the endpoint build. */
function toEpochMs(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const epochMs = numeric > 1e12 ? numeric : numeric * 1000;
  // Anything before 2001 or far in the future is not a usable live start.
  if (epochMs < 978_307_200_000 || epochMs > 4_102_444_800_000) return null;
  return epochMs;
}

/**
 * `profileRoom` is the endpoint the Huya web player itself uses. `liveStatus`
 * is `ON` for a live room (it can also be `REPLAY`/`OFF`), and
 * `liveData.startTime` is the epoch of the current session.
 */
export class HuyaLiveStatusResolver {
  constructor(private readonly http: HttpClient) {}

  async resolve(roomId: string, signal?: AbortSignal): Promise<RoomLiveStatus> {
    const normalizedRoomId = roomId.trim();
    if (!normalizedRoomId) return unknownStatus(roomId);

    let payload: ProfileRoomResponse;
    try {
      const response = await this.http.request({
        url: `https://mp.huya.com/cache.php?m=Live&do=profileRoom&roomid=${encodeURIComponent(normalizedRoomId)}`,
        headers: { Referer: `https://www.huya.com/${encodeURIComponent(normalizedRoomId)}` },
        signal,
        timeoutMs: 6_000,
        retry: 'safe',
      });
      if (response.status !== 200) return unknownStatus(normalizedRoomId);
      payload = await response.json<ProfileRoomResponse>();
    } catch {
      return unknownStatus(normalizedRoomId);
    }

    const data = payload.data;
    if (Number(payload.status) !== 200 || !data) return unknownStatus(normalizedRoomId);

    const state = data.realLiveStatus ?? data.liveStatus ?? '';
    const live = state === 'ON';
    const liveSince = live ? toEpochMs(data.liveData?.startTime) : null;
    return {
      platform: 'huya',
      roomId: normalizedRoomId,
      live,
      liveSince,
      fetchedAt: Date.now(),
    };
  }
}
