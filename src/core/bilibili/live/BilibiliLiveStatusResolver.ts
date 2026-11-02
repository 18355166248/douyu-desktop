import type { RoomLiveStatus } from '@shared/contracts/liveStatus';
import { parseBeijingDateTime } from '@shared/time/beijingTime';
import type { HttpClient } from '../../ports/HttpClient';

interface RoomInfoResponse {
  code?: number | string;
  message?: string;
  msg?: string;
  data?: {
    room_id?: number | string;
    live_status?: number | string;
    live_time?: string;
  };
}

function unknownStatus(roomId: string): RoomLiveStatus {
  return {
    platform: 'bilibili',
    roomId,
    live: null,
    liveSince: null,
    fetchedAt: Date.now(),
  };
}

/**
 * `get_info` accepts both the short id and the real room id, and returns
 * `live_status` plus `live_time` (the start of the current session in Beijing
 * time). The id is echoed back unchanged so the renderer can key the result
 * against the room it is actually playing.
 */
export class BilibiliLiveStatusResolver {
  constructor(private readonly http: HttpClient) {}

  async resolve(roomId: string, signal?: AbortSignal): Promise<RoomLiveStatus> {
    const normalizedRoomId = roomId.trim();
    if (!normalizedRoomId) return unknownStatus(roomId);

    let payload: RoomInfoResponse;
    try {
      const response = await this.http.request({
        url: `https://api.live.bilibili.com/room/v1/Room/get_info?room_id=${encodeURIComponent(normalizedRoomId)}`,
        headers: { Referer: 'https://live.bilibili.com/' },
        signal,
        timeoutMs: 6_000,
        retry: 'safe',
      });
      if (response.status !== 200) return unknownStatus(normalizedRoomId);
      payload = await response.json<RoomInfoResponse>();
    } catch {
      return unknownStatus(normalizedRoomId);
    }

    const data = payload.data;
    if (Number(payload.code) !== 0 || !data) return unknownStatus(normalizedRoomId);

    const live = Number(data.live_status) === 1;
    const liveTime = parseBeijingDateTime(data.live_time);
    return {
      platform: 'bilibili',
      roomId: normalizedRoomId,
      live,
      liveSince: live ? liveTime : null,
      fetchedAt: Date.now(),
    };
  }
}
