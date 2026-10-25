import { session } from 'electron';
import type { DouyuQuality, ResolveStreamInput, StreamPlayback } from '@shared/contracts/stream';
import { AppError } from '@core/errors';
import { BilibiliStreamResolver } from '@core/bilibili/stream/BilibiliStreamResolver';
import { BilibiliDanmakuConfigResolver } from '@core/bilibili/danmaku/BilibiliDanmakuConfigResolver';
import { DouyuStreamResolver } from '@core/douyu/stream/DouyuStreamResolver';
import { DouyuHttpClient } from '@core/http/DouyuHttpClient';
import { CHROME_UA } from '../constants';
import { SessionHttpClient } from '../adapters/electron/SessionHttpClient';
import type { PlatformLoginManager } from './PlatformLoginManager';

function isDouyuQuality(value: string | undefined): value is DouyuQuality {
  return value === '0' || value === '3' || value === '4' || value === '8';
}

export class StreamService {
  private readonly http: DouyuHttpClient;
  private readonly douyu: DouyuStreamResolver;

  constructor(private readonly platforms: PlatformLoginManager) {
    this.http = new DouyuHttpClient(new SessionHttpClient(session.defaultSession, CHROME_UA), {
      minIntervalMs: 0,
      maxAttempts: 2,
    });
    this.douyu = new DouyuStreamResolver(this.http);
  }

  private bilibiliHttp(): DouyuHttpClient {
    return new DouyuHttpClient(
      new SessionHttpClient(this.platforms.getSession('bilibili'), CHROME_UA),
      {
        minIntervalMs: 0,
        maxAttempts: 2,
      },
    );
  }

  async bilibiliDanmakuConfig(roomId: string): Promise<{ host: string; token: string }> {
    return new BilibiliDanmakuConfigResolver(this.http).resolve(roomId);
  }

  async resolve(input: ResolveStreamInput): Promise<StreamPlayback> {
    const platform = input.platform ?? 'douyu';
    if (platform === 'bilibili') {
      return new BilibiliStreamResolver(this.bilibiliHttp()).resolve(
        input.roomId,
        input.quality ?? '10000',
        input.preferHls ?? false,
      );
    }
    if (platform === 'huya') {
      throw new AppError('INVALID_INPUT', '虎牙播放适配中，登录状态已保存');
    }
    return this.douyu.resolve(
      input.roomId,
      isDouyuQuality(input.quality) ? input.quality : '0',
      input.preferHls ?? false,
    );
  }
}
