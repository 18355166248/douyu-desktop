import type { RoomLiveStatus } from '@shared/contracts/liveStatus';
import { parseBeijingDateTime } from '@shared/time/beijingTime';
import type { HttpClient } from '../../ports/HttpClient';

interface RoomApiResponse {
  error?: number | string;
  msg?: string;
  data?: {
    room_status?: string | number;
    start_time?: string;
    end_time?: string;
    videoLoop?: string | number;
  };
}

function unknownStatus(roomId: string): RoomLiveStatus {
  return {
    platform: 'douyu',
    roomId,
    live: null,
    liveSince: null,
    fetchedAt: Date.now(),
  };
}

/**
 * `open.douyucdn.cn/api/RoomApi/room/{rid}` is the公开房间接口斗鱼客户端在用：
 * `room_status` 是开播状态，`start_time` 是本次开播时间（北京时间）。
 * 它同时返回大量礼物配置，所以不做高频轮询，只按需查询。
 */
export class DouyuLiveStatusResolver {
  constructor(private readonly http: HttpClient) {}

  async resolve(roomId: string, signal?: AbortSignal): Promise<RoomLiveStatus> {
    const normalizedRoomId = roomId.trim();
    if (!normalizedRoomId) return unknownStatus(roomId);

    let payload: RoomApiResponse;
    try {
      const response = await this.http.request({
        url: `https://open.douyucdn.cn/api/RoomApi/room/${encodeURIComponent(normalizedRoomId)}`,
        headers: { Referer: `https://www.douyu.com/${encodeURIComponent(normalizedRoomId)}` },
        signal,
        timeoutMs: 6_000,
        retry: 'safe',
      });
      if (response.status !== 200) return unknownStatus(normalizedRoomId);
      payload = await response.json<RoomApiResponse>();
    } catch {
      return unknownStatus(normalizedRoomId);
    }

    const data = payload.data;
    if (Number(payload.error) !== 0 || !data) return unknownStatus(normalizedRoomId);

    const live = String(data.room_status ?? '') === '1';
    const startTime = parseBeijingDateTime(data.start_time);
    return {
      platform: 'douyu',
      roomId: normalizedRoomId,
      live,
      liveSince: live ? startTime : null,
      fetchedAt: Date.now(),
    };
  }
}
