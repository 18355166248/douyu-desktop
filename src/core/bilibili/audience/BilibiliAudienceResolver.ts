import { AppError } from '../../errors';
import type { HttpClient } from '../../ports/HttpClient';
import type { RoomAudienceSnapshot } from '@shared/contracts/audience';

interface BilibiliResponse<T> {
  code?: number | string;
  message?: string;
  msg?: string;
  data?: T;
}

interface AudienceData {
  room_info?: { room_id?: number | string; uid?: number | string; online?: unknown };
  anchor_info?: { relation_info?: { attention?: unknown } };
  guard_info?: { count?: unknown };
  watched_show?: { num?: unknown };
}

interface LegacyRoomInfo {
  room_id?: number | string;
  uid?: number | string;
  online?: unknown;
  attention?: unknown;
}

interface OnlineRankData {
  onlineNum?: unknown;
  onlineNumText?: string;
}

interface GuardData {
  info?: { num?: unknown };
}

function count(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^\d+$/.test(value.trim())) return null;
  const result = Number(value);
  return Number.isSafeInteger(result) && result >= 0 ? result : null;
}

export class BilibiliAudienceResolver {
  constructor(private readonly http: HttpClient) {}

  async resolve(roomId: string, signal?: AbortSignal): Promise<RoomAudienceSnapshot> {
    const inputRoomId = roomId.trim();
    if (!inputRoomId) throw new AppError('INVALID_INPUT', '请输入 B 站房间号');

    let data: AudienceData;
    try {
      data = await this.fetchData<AudienceData>(
        `/xlive/web-room/v1/index/getInfoByRoom?room_id=${encodeURIComponent(inputRoomId)}`,
        signal,
      );
    } catch (error) {
      signal?.throwIfAborted();
      data = await this.fetchLegacyData(inputRoomId, signal, error);
    }
    const canonicalRoomId = String(data.room_info?.room_id ?? inputRoomId);
    const uid = data.room_info?.uid;
    const [onlineRank, guards] = uid
      ? await Promise.allSettled([
          this.fetchData<OnlineRankData>(
            `/xlive/general-interface/v1/rank/getOnlineGoldRank?${new URLSearchParams({
              ruid: String(uid),
              roomId: canonicalRoomId,
              page: '1',
              pageSize: '1',
            })}`,
            signal,
          ),
          this.fetchData<GuardData>(
            `/xlive/app-room/v2/guardTab/topList?${new URLSearchParams({
              roomid: canonicalRoomId,
              page: '1',
              ruid: String(uid),
              page_size: '1',
            })}`,
            signal,
          ),
        ])
      : [];
    signal?.throwIfAborted();
    const online = onlineRank?.status === 'fulfilled' ? onlineRank.value : undefined;
    const highEnergyCount = count(online?.onlineNum);
    const guardCount = guards?.status === 'fulfilled' ? count(guards.value.info?.num) : null;
    return {
      platform: 'bilibili',
      roomId: canonicalRoomId,
      fetchedAt: Date.now(),
      metrics: [
        {
          key: 'highEnergy',
          label: '高能榜',
          value: highEnergyCount,
          unit: '人',
          ...(highEnergyCount !== null &&
          typeof online?.onlineNumText === 'string' &&
          online.onlineNumText.includes('+')
            ? { isLowerBound: true }
            : {}),
          description: 'B 站高能榜人数；投喂、发弹幕等均可上榜，不代表实时在线总人数。',
        },
        {
          key: 'guards',
          label: '大航海',
          value: count(data.guard_info?.count) ?? guardCount,
          unit: '人',
          description: '房间的大航海成员数，不代表当前在线人数。',
        },
        {
          key: 'watched',
          label: '看过',
          value: count(data.watched_show?.num),
          unit: '人',
          description: 'B 站展示的看过人数，不代表实时在线人数。',
        },
        {
          key: 'followers',
          label: '关注',
          value: count(data.anchor_info?.relation_info?.attention),
          unit: '人',
          description: '主播的关注人数，不代表当前在线人数或粉丝团人数。',
        },
        {
          key: 'popularity',
          label: '人气',
          value: count(data.room_info?.online),
          unit: '热度',
          description: 'B 站返回的人气热度，不代表实时在线人数。',
        },
      ],
    };
  }

  private async fetchData<T>(path: string, signal?: AbortSignal): Promise<T> {
    const response = await this.http.request({
      url: `https://api.live.bilibili.com${path}`,
      headers: { Referer: 'https://live.bilibili.com/' },
      signal,
      timeoutMs: 8_000,
      retry: 'safe',
    });
    const payload = await response.json<BilibiliResponse<T>>();
    if (Number(payload.code) !== 0 || !payload.data) {
      throw new AppError(
        'UPSTREAM',
        payload.message?.trim() || payload.msg?.trim() || 'B 站房间数据暂不可用',
        { details: { code: payload.code } },
      );
    }
    return payload.data;
  }

  private async fetchLegacyData(
    roomId: string,
    signal: AbortSignal | undefined,
    richEndpointError: unknown,
  ): Promise<AudienceData> {
    // The rich endpoint can return -352 for anonymous sessions. The basic room
    // API still exposes attention and online; neither is a live viewer count.
    let roomInfo: LegacyRoomInfo;
    try {
      roomInfo = await this.fetchData<LegacyRoomInfo>(
        `/room/v1/Room/get_info?room_id=${encodeURIComponent(roomId)}`,
        signal,
      );
    } catch {
      signal?.throwIfAborted();
      throw richEndpointError;
    }
    signal?.throwIfAborted();
    return {
      room_info: roomInfo,
      anchor_info: {
        relation_info: {
          attention: count(roomInfo.attention),
        },
      },
    };
  }
}
