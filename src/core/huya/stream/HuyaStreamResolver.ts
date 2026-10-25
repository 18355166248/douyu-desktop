import { AppError } from '../../errors';
import type { HttpClient } from '../../ports/HttpClient';
import type { StreamPlayback } from '@shared/contracts/stream';

const HUYA_PROFILE_URL = 'https://mp.huya.com/cache.php?m=Live&do=profileRoom&roomid=';

interface HuyaResponse {
  status?: number | string;
  message?: string;
  data?: HuyaRoomData;
}

interface HuyaRoomData {
  liveStatus?: string;
  realLiveStatus?: string;
  stream?: {
    hls?: {
      multiLine?: HuyaLine[];
      rateArray?: HuyaRate[];
    };
    baseSteamInfoList?: Record<string, HuyaBaseStream> | HuyaBaseStream[];
  };
  liveData?: {
    nick?: string;
    roomName?: string;
    profileRoom?: number | string;
    screenshot?: string;
    avatar180?: string;
  };
  profileInfo?: {
    nick?: string;
  };
}

interface HuyaBaseStream {
  sCdnType?: string;
  sStreamName?: string;
  sHlsUrl?: string;
  sHlsAntiCode?: string;
  iWebPriorityRate?: number;
}

interface HuyaLine {
  url?: string;
  cdnType?: string;
  webPriorityRate?: number;
}

interface HuyaRate {
  sDisplayName?: string;
  iBitRate?: number;
  iCodecType?: number;
}

function toHttpsUrl(value: string): string {
  // Huya CDN signatures are query-string sensitive; do not round-trip through URL.
  return value.startsWith('http://') ? `https://${value.slice('http://'.length)}` : value;
}

function toLines(data: HuyaRoomData): Array<{
  url: string;
  cdnType: string | undefined;
  webPriorityRate: number | undefined;
}> {
  const baseStreams = data.stream?.baseSteamInfoList
    ? Object.values(data.stream.baseSteamInfoList)
    : [];
  const fromBase = baseStreams
    .filter(
      (info): info is HuyaBaseStream & { sStreamName: string; sHlsUrl: string; sHlsAntiCode: string } =>
        Boolean(info.sStreamName && info.sHlsUrl && info.sHlsAntiCode),
    )
    .map((info) => ({
      cdnType: info.sCdnType,
      webPriorityRate: info.iWebPriorityRate,
      // This is how the Huya web player builds its HLS URL; antiCode is refreshed
      // by the API on every resolution, unlike the prebuilt multiLine URLs.
      url: `${toHttpsUrl(info.sHlsUrl)}/${info.sStreamName}.m3u8?ratio=2000&${info.sHlsAntiCode.replace(/&amp;/g, '&')}`,
    }));

  const fallback = (data.stream?.hls?.multiLine ?? [])
    .filter((line): line is HuyaLine & { url: string } => Boolean(line.url))
    .map((line) => ({
      url: line.url,
      cdnType: line.cdnType,
      webPriorityRate: line.webPriorityRate,
    }));

  return [...(fromBase.length > 0 ? fromBase : fallback)].sort((left, right) => {
    const leftHuya = left.cdnType?.startsWith('HS') ? 1 : 0;
    const rightHuya = right.cdnType?.startsWith('HS') ? 1 : 0;
    return rightHuya - leftHuya || (right.webPriorityRate ?? 0) - (left.webPriorityRate ?? 0);
  });
}

function qualityLabel(data: HuyaRoomData, url: string): string {
  const ratio = Number(new URL(url).searchParams.get('ratio') ?? 0);
  const rate =
    data.stream?.hls?.rateArray?.find((entry) => entry.iBitRate === ratio && entry.iCodecType !== 1) ??
    data.stream?.hls?.rateArray?.find((entry) => entry.iBitRate === ratio);
  return rate?.sDisplayName?.trim() || '超清';
}

function expiresAtFor(url: string): number | undefined {
  const value = new URL(url).searchParams.get('wsTime');
  if (!value) return undefined;
  const seconds = Number.parseInt(value, 16);
  return Number.isFinite(seconds) && seconds > 0 ? (seconds + 60 * 60) * 1000 : undefined;
}

export interface HuyaStreamCandidates {
  playback: StreamPlayback;
  urls: string[];
}

export class HuyaStreamResolver {
  constructor(private readonly http: HttpClient) {}

  async resolve(roomId: string, signal?: AbortSignal): Promise<StreamPlayback> {
    const { playback } = await this.resolveCandidates(roomId, signal);
    return playback;
  }

  async resolveCandidates(roomId: string, signal?: AbortSignal): Promise<HuyaStreamCandidates> {
    const inputRoomId = roomId.trim();
    if (!inputRoomId) throw new AppError('INVALID_INPUT', '请输入虎牙房间号');

    const response = await this.http.request({
      url: `${HUYA_PROFILE_URL}${encodeURIComponent(inputRoomId)}&_t=${Date.now()}`,
      signal,
      timeoutMs: 8_000,
      retry: 'safe',
    });
    const payload = await response.json<HuyaResponse>();
    const data = payload.data;

    if (!data || Number(payload.status) !== 200) {
      throw new AppError('UPSTREAM', payload.message?.trim() || '虎牙房间不存在');
    }
    if (data.liveStatus !== 'ON') {
      throw new AppError('UPSTREAM', '主播未开播');
    }

    const lines = toLines(data);
    const urls = lines.map((line) => toHttpsUrl(line.url));
    const selected = urls[0];
    if (!selected) {
      throw new AppError('UPSTREAM', '虎牙没有返回可用的 HLS 线路');
    }

    const expiresAt = expiresAtFor(selected);
    const cover = (data.liveData?.screenshot ?? data.liveData?.avatar180)?.trim();
    return {
      playback: {
        platform: 'huya',
        roomId: String(data.liveData?.profileRoom ?? inputRoomId),
        title: data.liveData?.roomName?.trim() || '虎牙直播',
        anchorName: data.liveData?.nick?.trim() || data.profileInfo?.nick?.trim() || '',
        url: selected,
        format: 'hls',
        quality: qualityLabel(data, selected),
        ...(cover ? { cover } : {}),
        ...(expiresAt ? { expiresAt } : {}),
      },
      urls,
    };
  }
}
