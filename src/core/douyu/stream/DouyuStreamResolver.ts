import { AppError } from '../../errors';
import type { HttpClient } from '../../ports/HttpClient';
import type { DouyuQuality, StreamPlayback } from '@shared/contracts/stream';
import { getDouyuAuth } from './douyuSign';

const DEFAULT_DID = '10000000000000000000000000001501';

const QUALITY_LABEL: Record<DouyuQuality, string> = {
  '0': '原画',
  '3': '高清',
  '4': '超清',
  '8': '蓝光',
};

interface EncryptionResponse {
  error: number | string;
  msg?: string;
  data?: {
    key: string;
    rand_str: string;
    enc_time: number | string;
    is_special: number | string;
    enc_data: string;
  };
}

interface PlayResponse {
  error: number | string;
  msg?: string;
  data?: {
    rtmp_url?: string;
    rtmp_live?: string;
    hls_url?: string;
    hls_live?: string;
    room_name?: string;
    nickname?: string;
  };
}

interface RoomInfoResponse {
  room?: {
    room_name?: string;
    nickname?: string;
    owner_name?: string;
  };
}

export interface DouyuStreamResolverOptions {
  did?: string;
}

export class DouyuStreamResolver {
  private readonly did: string;

  constructor(
    private readonly http: HttpClient,
    options: DouyuStreamResolverOptions = {},
  ) {
    this.did = options.did ?? DEFAULT_DID;
  }

  async resolve(
    roomId: string,
    quality: DouyuQuality = '0',
    preferHls = false,
    signal?: AbortSignal,
  ): Promise<StreamPlayback> {
    const normalizedRoomId = roomId.trim();
    if (!normalizedRoomId) throw new AppError('INVALID_INPUT', '请输入房间号');

    const encryptionResponse = await this.http.request({
      url: `https://www.douyu.com/wgapi/livenc/liveweb/websec/getEncryption?did=${encodeURIComponent(this.did)}`,
      headers: { Referer: `https://www.douyu.com/${normalizedRoomId}` },
      signal,
      retry: 'safe',
    });
    const encryption = await encryptionResponse.json<EncryptionResponse>();
    if (Number(encryption.error) !== 0 || !encryption.data) {
      throw new AppError('UPSTREAM', encryption.msg ?? '斗鱼加密信息获取失败', {
        details: { error: encryption.error },
      });
    }

    const data = encryption.data;
    const timestamp = Math.round(Date.now() / 1000);
    const auth = getDouyuAuth(
      normalizedRoomId,
      timestamp,
      data.key,
      data.rand_str,
      Number(data.enc_time),
      Number(data.is_special),
    );
    const body = new URLSearchParams({
      enc_data: data.enc_data,
      tt: String(timestamp),
      did: this.did,
      auth,
      cdn: '',
      rate: quality,
      hevc: '0',
      fa: '0',
      ive: '0',
    }).toString();

    const roomPromise = this.fetchRoomInfo(normalizedRoomId, signal);
    const playResponse = await this.http.request({
      url: `https://www.douyu.com/lapi/live/getH5PlayV1/${encodeURIComponent(normalizedRoomId)}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: `https://www.douyu.com/${normalizedRoomId}`,
      },
      body,
      signal,
      retry: 'safe',
    });
    const play = await playResponse.json<PlayResponse>();
    if (Number(play.error) !== 0 || !play.data) {
      throw new AppError('UPSTREAM', play.msg ?? '斗鱼直播流解析失败', {
        details: { error: play.error },
      });
    }

    const hlsUrl =
      play.data.hls_url && play.data.hls_live ? `${play.data.hls_url}/${play.data.hls_live}` : '';
    const flvUrl =
      play.data.rtmp_url && play.data.rtmp_live
        ? `${play.data.rtmp_url}/${play.data.rtmp_live}`
        : '';
    const useHls = preferHls && hlsUrl.length > 0;
    const url = useHls ? hlsUrl : flvUrl;
    if (!url) {
      throw new AppError('UPSTREAM', '斗鱼没有返回可用的播放地址');
    }

    const room = await roomPromise;

    return {
      platform: 'douyu',
      roomId: normalizedRoomId,
      title: play.data.room_name ?? room?.room_name ?? '斗鱼直播',
      anchorName: play.data.nickname ?? room?.nickname ?? room?.owner_name ?? '',
      url,
      format: useHls ? 'hls' : 'flv',
      quality: QUALITY_LABEL[quality],
    };
  }

  private async fetchRoomInfo(
    roomId: string,
    signal?: AbortSignal,
  ): Promise<RoomInfoResponse['room'] | undefined> {
    try {
      const response = await this.http.request({
        url: `https://www.douyu.com/betard/${encodeURIComponent(roomId)}`,
        headers: { Referer: `https://www.douyu.com/${roomId}` },
        signal,
        timeoutMs: 5_000,
        retry: 'safe',
      });
      if (response.status !== 200) return undefined;
      const payload = await response.json<RoomInfoResponse>();
      return payload.room;
    } catch {
      return undefined;
    }
  }
}
