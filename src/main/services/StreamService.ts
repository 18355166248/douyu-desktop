import { session } from 'electron';
import type { DouyuQuality, ResolveStreamInput, StreamPlayback } from '@shared/contracts/stream';
import { AppError } from '@core/errors';
import { BilibiliStreamResolver } from '@core/bilibili/stream/BilibiliStreamResolver';
import { BilibiliDanmakuConfigResolver } from '@core/bilibili/danmaku/BilibiliDanmakuConfigResolver';
import { DouyuStreamResolver } from '@core/douyu/stream/DouyuStreamResolver';
import { DouyuHttpClient } from '@core/http/DouyuHttpClient';
import { CHROME_UA } from '../constants';
import { SessionHttpClient } from '../adapters/electron/SessionHttpClient';

function isDouyuQuality(value: string | undefined): value is DouyuQuality {
  return value === '0' || value === '3' || value === '4' || value === '8';
}

export class StreamService {
  private readonly http: DouyuHttpClient;
  private readonly douyu: DouyuStreamResolver;
  private readonly bilibili: BilibiliStreamResolver;
  private readonly bilibiliDanmaku: BilibiliDanmakuConfigResolver;

  constructor() {
    this.http = new DouyuHttpClient(new SessionHttpClient(session.defaultSession, CHROME_UA), {
      minIntervalMs: 0,
      maxAttempts: 2,
    });
    this.douyu = new DouyuStreamResolver(this.http);
    this.bilibili = new BilibiliStreamResolver(this.http);
    this.bilibiliDanmaku = new BilibiliDanmakuConfigResolver(this.http);
  }

  async bilibiliDanmakuConfig(roomId: string): Promise<{ host: string; token: string }> {
    return this.bilibiliDanmaku.resolve(roomId);
  }

  async resolve(input: ResolveStreamInput): Promise<StreamPlayback> {
    const platform = input.platform ?? 'douyu';
    if (platform === 'bilibili') {
      return this.bilibili.resolve(
        input.roomId,
        input.quality ?? '10000',
        input.preferHls ?? false,
      );
    }
    if (platform === 'huya') {
      throw new AppError('INVALID_INPUT', '虎牙暂未接入');
    }
    return this.douyu.resolve(
      input.roomId,
      isDouyuQuality(input.quality) ? input.quality : '0',
      input.preferHls ?? false,
    );
  }
}
