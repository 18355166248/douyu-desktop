import { session } from 'electron';
import type { ResolveStreamInput, StreamPlayback } from '@shared/contracts/stream';
import { DouyuStreamResolver } from '@core/douyu/stream/DouyuStreamResolver';
import { DouyuHttpClient } from '@core/http/DouyuHttpClient';
import { CHROME_UA } from '../constants';
import { SessionHttpClient } from '../adapters/electron/SessionHttpClient';

export class StreamService {
  private readonly resolver: DouyuStreamResolver;

  constructor() {
    const http = new DouyuHttpClient(new SessionHttpClient(session.defaultSession, CHROME_UA), {
      minIntervalMs: 0,
      maxAttempts: 2,
    });
    this.resolver = new DouyuStreamResolver(http);
  }

  async resolve(input: ResolveStreamInput): Promise<StreamPlayback> {
    return this.resolver.resolve(input.roomId, input.quality ?? '0', input.preferHls ?? false);
  }
}
