import { session } from 'electron';
import type { RoomAudienceInput, RoomAudienceSnapshot } from '@shared/contracts/audience';
import type { DouyuQuality, ResolveStreamInput, StreamPlayback } from '@shared/contracts/stream';
import { BilibiliAudienceResolver } from '@core/bilibili/audience/BilibiliAudienceResolver';
import { DouyuAudienceResolver } from '@core/douyu/audience/DouyuAudienceResolver';
import { HuyaAudienceResolver } from '@core/huya/audience/HuyaAudienceResolver';
import { BilibiliStreamResolver } from '@core/bilibili/stream/BilibiliStreamResolver';
import { BilibiliDanmakuConfigResolver } from '@core/bilibili/danmaku/BilibiliDanmakuConfigResolver';
import { DouyuStreamResolver } from '@core/douyu/stream/DouyuStreamResolver';
import { HuyaStreamResolver } from '@core/huya/stream/HuyaStreamResolver';
import { DouyuHttpClient } from '@core/http/DouyuHttpClient';
import { CHROME_UA } from '../constants';
import { SessionHttpClient } from '../adapters/electron/SessionHttpClient';
import { HuyaHlsProxy } from './HuyaHlsProxy';
import type { PlatformLoginManager } from './PlatformLoginManager';

function isDouyuQuality(value: string | undefined): value is DouyuQuality {
  return value === '0' || value === '3' || value === '4' || value === '8';
}

export class StreamService {
  private readonly http: DouyuHttpClient;
  private readonly douyu: DouyuStreamResolver;
  private readonly huyaProxy: HuyaHlsProxy;

  constructor(private readonly platforms: PlatformLoginManager) {
    this.http = new DouyuHttpClient(new SessionHttpClient(session.defaultSession, CHROME_UA), {
      minIntervalMs: 0,
      maxAttempts: 2,
    });
    this.douyu = new DouyuStreamResolver(this.http);
    this.huyaProxy = new HuyaHlsProxy(async (roomId) => {
      const { urls } = await new HuyaStreamResolver(this.huyaHttp()).resolveCandidates(roomId);
      return urls;
    });
  }

  async start(): Promise<void> {
    await this.huyaProxy.start();
  }

  stop(): void {
    this.huyaProxy.stop();
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

  private huyaHttp(): DouyuHttpClient {
    return new DouyuHttpClient(
      new SessionHttpClient(this.platforms.getSession('huya'), CHROME_UA),
      {
        minIntervalMs: 0,
        maxAttempts: 2,
      },
    );
  }

  async bilibiliDanmakuConfig(roomId: string): Promise<{ host: string; token: string }> {
    return new BilibiliDanmakuConfigResolver(this.http).resolve(roomId);
  }

  async audience(input: RoomAudienceInput): Promise<RoomAudienceSnapshot> {
    if (input.platform === 'bilibili') {
      return new BilibiliAudienceResolver(this.bilibiliHttp()).resolve(input.roomId);
    }
    if (input.platform === 'huya') {
      return new HuyaAudienceResolver(this.huyaHttp()).resolve(input.roomId);
    }
    return new DouyuAudienceResolver(this.http).resolve(input.roomId);
  }

  async pk(roomId: string) {
    return (await new DouyuAudienceResolver(this.http).resolve(roomId, undefined, true)).pk ?? null;
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
      const { playback } = await new HuyaStreamResolver(this.huyaHttp()).resolveCandidates(
        input.roomId,
      );
      try {
        await this.huyaProxy.prepare(playback.roomId);
      } catch {
        // Let hls.js retry through the stable local URL.
      }
      return { ...playback, url: this.huyaProxy.playlistUrl(playback.roomId) };
    }
    return this.douyu.resolve(
      input.roomId,
      isDouyuQuality(input.quality) ? input.quality : '0',
      input.preferHls ?? false,
    );
  }
}
