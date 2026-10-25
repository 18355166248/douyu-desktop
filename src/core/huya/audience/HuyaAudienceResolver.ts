import { AppError } from '../../errors';
import type { HttpClient } from '../../ports/HttpClient';
import type { RoomAudienceSnapshot } from '@shared/contracts/audience';

interface HuyaAudienceResponse {
  status?: number | string;
  message?: string;
  data?: {
    liveData?: { profileRoom?: number | string; totalCount?: unknown; activityCount?: unknown };
    profileInfo?: { activityCount?: unknown };
  };
}

function count(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^\d+$/.test(value.trim())) return null;
  const result = Number(value);
  return Number.isSafeInteger(result) && result >= 0 ? result : null;
}

export class HuyaAudienceResolver {
  constructor(private readonly http: HttpClient) {}

  async resolve(roomId: string, signal?: AbortSignal): Promise<RoomAudienceSnapshot> {
    const inputRoomId = roomId.trim();
    if (!inputRoomId) throw new AppError('INVALID_INPUT', '请输入虎牙房间号');

    const response = await this.http.request({
      url: `https://mp.huya.com/cache.php?m=Live&do=profileRoom&roomid=${encodeURIComponent(inputRoomId)}&_t=${Date.now()}`,
      headers: { Referer: 'https://www.huya.com/' },
      signal,
      timeoutMs: 8_000,
      retry: 'safe',
    });
    const payload = await response.json<HuyaAudienceResponse>();
    if (!payload.data || Number(payload.status) !== 200) {
      throw new AppError('UPSTREAM', payload.message?.trim() || '虎牙房间数据暂不可用');
    }

    return {
      platform: 'huya',
      roomId: String(payload.data.liveData?.profileRoom ?? inputRoomId),
      fetchedAt: Date.now(),
      metrics: [
        {
          key: 'subscribers',
          label: '订阅',
          // The official room's subscribe-count / #activityCount displays this
          // profile count. It is separate from totalCount (popularity).
          value:
            count(payload.data.profileInfo?.activityCount) ??
            count(payload.data.liveData?.activityCount),
          unit: '人',
          description: '主播的累计订阅人数，不代表实时在线人数。',
        },
        {
          key: 'popularity',
          label: '人气',
          value: count(payload.data.liveData?.totalCount),
          unit: '热度',
          description: '虎牙展示的人气热度，不代表实时在线人数。',
        },
        {
          key: 'vip',
          label: '贵宾',
          value: null,
          unit: '人',
          description: '已确认官网支持贵宾统计，当前尚未接入贵宾席协议。',
        },
      ],
    };
  }
}
