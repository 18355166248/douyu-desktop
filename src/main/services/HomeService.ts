import type { FollowedRoom } from '@shared/contracts/follow';
import { AppError } from '@core/errors';
import { FollowedRoomsQuery } from '@core/douyu/queries/FollowedRoomsQuery';
import { DouyuHttpClient } from '@core/http/DouyuHttpClient';
import { CHROME_UA } from '../constants';
import { SessionHttpClient } from '../adapters/electron/SessionHttpClient';
import type { AccountSessionManager } from './AccountSessionManager';

export class HomeService {
  constructor(private readonly accounts: AccountSessionManager) {}

  async followed(): Promise<FollowedRoom[]> {
    const accountId = await this.accounts.getActiveId();
    if (!accountId) throw new AppError('AUTH_REQUIRED', '请先登录斗鱼');
    const accountSession = await this.accounts.getSession(accountId);
    const http = new DouyuHttpClient(new SessionHttpClient(accountSession, CHROME_UA));
    return new FollowedRoomsQuery(http).list({ maxPages: 5 });
  }
}
