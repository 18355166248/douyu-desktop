import { AppError } from '../../errors';
import type { HttpClient } from '../../ports/HttpClient';
import type { StreamPlayback } from '@shared/contracts/stream';

const BILIBILI_REFERER = 'https://live.bilibili.com/';

const QUALITY_LABEL: Readonly<Record<string, string>> = {
  '80': '流畅',
  '150': '高清',
  '250': '超清',
  '400': '蓝光',
  '10000': '原画',
};

interface BilibiliResponse<T> {
  code: number | string;
  message?: string;
  msg?: string;
  data?: T;
}

interface RoomInitData {
  room_id: number | string;
  short_id?: number | string;
  live_status?: number | string;
}

interface RoomInfoData {
  title?: string;
  uid?: number | string;
  live_status?: number | string;
}

interface AnchorData {
  info?: {
    uname?: string;
  };
}

interface UrlInfo {
  host?: string;
  extra?: string;
  stream_ttl?: number | string;
}

interface PlayCodec {
  codec_name?: string;
  base_url?: string;
  current_qn?: number | string;
  url_info?: UrlInfo[];
}

interface PlayFormat {
  format_name?: string;
  codec?: PlayCodec[];
}

interface PlayStream {
  protocol_name?: string;
  format?: PlayFormat[];
}

interface PlayInfoData {
  room_id?: number | string;
  live_status?: number | string;
  playurl_info?: {
    playurl?: {
      stream?: PlayStream[];
    };
  };
}

interface SelectedStream {
  url: string;
  format: 'hls' | 'flv';
  quality: string;
  expiresAt?: number;
}

function errorMessage(payload: BilibiliResponse<unknown>, fallback: string): string {
  return payload.message ?? payload.msg ?? fallback;
}

function toQn(quality: string | undefined): string {
  if (quality && quality in QUALITY_LABEL) return quality;
  return '10000';
}

function pickCodec(
  streams: PlayStream[],
  protocol: 'http_stream' | 'http_hls',
  preferredFormats: string[],
): PlayCodec | undefined {
  const stream = streams.find((entry) => entry.protocol_name === protocol);
  if (!stream) return undefined;

  for (const formatName of preferredFormats) {
    const format = stream.format?.find((entry) => entry.format_name === formatName);
    const codec =
      format?.codec?.find((entry) => entry.codec_name === 'avc') ??
      format?.codec?.find((entry) => entry.base_url && entry.url_info?.[0]?.host);
    if (codec?.base_url && codec.url_info?.[0]?.host) return codec;
  }

  return undefined;
}

function buildUrl(codec: PlayCodec): SelectedStream | null {
  const info = codec.url_info?.[0];
  if (!info?.host || !codec.base_url) return null;

  const expires = new URLSearchParams(info.extra ?? '').get('expires');
  const expiresAt = expires ? Number(expires) * 1000 : undefined;
  return {
    url: `${info.host}${codec.base_url}${info.extra ?? ''}`,
    format: codec.base_url.includes('.m3u8') ? 'hls' : 'flv',
    quality: QUALITY_LABEL[String(codec.current_qn)] ?? '原画',
    ...(Number.isFinite(expiresAt) && expiresAt ? { expiresAt } : {}),
  };
}

export class BilibiliStreamResolver {
  constructor(private readonly http: HttpClient) {}

  async resolve(
    roomId: string,
    quality?: string,
    preferHls = false,
    signal?: AbortSignal,
  ): Promise<StreamPlayback> {
    const inputRoomId = roomId.trim();
    if (!inputRoomId) throw new AppError('INVALID_INPUT', '请输入 B 站房间号');

    const roomResponse = await this.http.request({
      url: `https://api.live.bilibili.com/room/v1/Room/room_init?id=${encodeURIComponent(inputRoomId)}`,
      headers: { Referer: BILIBILI_REFERER },
      signal,
      retry: 'safe',
    });
    const room = await roomResponse.json<BilibiliResponse<RoomInitData>>();
    if (Number(room.code) !== 0 || !room.data?.room_id) {
      throw new AppError('UPSTREAM', errorMessage(room, 'B 站房间不存在'), {
        details: { code: room.code },
      });
    }

    const realRoomId = String(room.data.room_id);
    if (Number(room.data.live_status) !== 1) {
      throw new AppError('UPSTREAM', '主播未开播');
    }

    const qn = toQn(quality);
    const [info, anchor, play] = await Promise.all([
      this.fetchRoomInfo(realRoomId, signal),
      this.fetchAnchor(realRoomId, signal),
      this.fetchPlayInfo(realRoomId, qn, signal),
    ]);

    if (Number(play.code) !== 0 || !play.data) {
      throw new AppError('UPSTREAM', errorMessage(play, 'B 站直播流解析失败'), {
        details: { code: play.code },
      });
    }

    const streams = play.data.playurl_info?.playurl?.stream ?? [];
    const hlsCodec = pickCodec(streams, 'http_hls', ['ts', 'fmp4']);
    const flvCodec = pickCodec(streams, 'http_stream', ['flv']);
    const hls = hlsCodec ? buildUrl(hlsCodec) : null;
    const flv = flvCodec ? buildUrl(flvCodec) : null;
    const selected = preferHls ? (hls ?? flv) : (flv ?? hls);

    if (!selected) {
      throw new AppError('UPSTREAM', 'B 站没有返回可用的播放地址');
    }

    return {
      platform: 'bilibili',
      roomId: realRoomId,
      title: info?.title ?? 'B 站直播',
      anchorName: anchor?.info?.uname ?? '',
      url: selected.url,
      format: selected.format,
      quality: selected.quality,
      ...(selected.expiresAt ? { expiresAt: selected.expiresAt } : {}),
    };
  }

  private async fetchRoomInfo(
    roomId: string,
    signal?: AbortSignal,
  ): Promise<RoomInfoData | undefined> {
    try {
      const response = await this.http.request({
        url: `https://api.live.bilibili.com/room/v1/Room/get_info?room_id=${encodeURIComponent(roomId)}`,
        headers: { Referer: BILIBILI_REFERER },
        signal,
        timeoutMs: 1_000,
        retry: 'none',
      });
      const payload = await response.json<BilibiliResponse<RoomInfoData>>();
      return Number(payload.code) === 0 ? payload.data : undefined;
    } catch {
      return undefined;
    }
  }

  private async fetchAnchor(roomId: string, signal?: AbortSignal): Promise<AnchorData | undefined> {
    try {
      const response = await this.http.request({
        url: `https://api.live.bilibili.com/live_user/v1/UserInfo/get_anchor_in_room?roomid=${encodeURIComponent(roomId)}`,
        headers: { Referer: BILIBILI_REFERER },
        signal,
        timeoutMs: 1_000,
        retry: 'none',
      });
      const payload = await response.json<BilibiliResponse<AnchorData>>();
      return Number(payload.code) === 0 ? payload.data : undefined;
    } catch {
      return undefined;
    }
  }

  private async fetchPlayInfo(
    roomId: string,
    qn: string,
    signal?: AbortSignal,
  ): Promise<BilibiliResponse<PlayInfoData>> {
    const query = new URLSearchParams({
      room_id: roomId,
      protocol: '0,1',
      format: '0,1,2',
      codec: '0,1',
      qn,
      platform: 'web',
      ptype: '8',
      dolby: '5',
      panorama: '1',
    });
    const response = await this.http.request({
      url: `https://api.live.bilibili.com/xlive/web-room/v2/index/getRoomPlayInfo?${query.toString()}`,
      headers: { Referer: BILIBILI_REFERER },
      signal,
      retry: 'safe',
    });
    return response.json<BilibiliResponse<PlayInfoData>>();
  }
}
