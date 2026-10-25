import { AppError } from '../../errors';
import type { HttpClient } from '../../ports/HttpClient';
import type { BilibiliDanmakuConfig } from '@shared/contracts/danmaku';

interface DanmuConfResponse {
  code: number | string;
  message?: string;
  msg?: string;
  data?: {
    host?: string;
    token?: string;
    host_server_list?: Array<{ host?: string; wss_port?: number }>;
  };
}

const BILIBILI_REFERER = 'https://live.bilibili.com/';
const DEFAULT_HOST = 'broadcastlv.chat.bilibili.com';

export class BilibiliDanmakuConfigResolver {
  constructor(private readonly http: HttpClient) {}

  async resolve(roomId: string, signal?: AbortSignal): Promise<BilibiliDanmakuConfig> {
    if (!roomId.trim()) throw new AppError('INVALID_INPUT', '请输入 B 站房间号');

    const response = await this.http.request({
      url: `https://api.live.bilibili.com/room/v1/Danmu/getConf?room_id=${encodeURIComponent(roomId)}&platform=pc&player=web`,
      headers: { Referer: BILIBILI_REFERER },
      signal,
      timeoutMs: 8_000,
      retry: 'safe',
    });
    const payload = await response.json<DanmuConfResponse>();
    if (Number(payload.code) !== 0 || !payload.data?.token) {
      throw new AppError(
        'UPSTREAM',
        payload.message ?? payload.msg ?? 'B 站弹幕服务不可用',
        { details: { code: payload.code } },
      );
    }

    const host =
      payload.data.host_server_list?.find((entry) => entry.host)?.host ??
      payload.data.host ??
      DEFAULT_HOST;

    return { host, token: payload.data.token };
  }
}
