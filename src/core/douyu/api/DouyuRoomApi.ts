import { AppError } from '../../errors';
import type { HttpClient } from '../../ports/HttpClient';
import type { DouyuAuthContext } from '../auth/DouyuAuthContext';

interface CheckInResponse {
  error: number | string;
  msg?: string;
}

export class DouyuRoomApi {
  constructor(
    private readonly http: HttpClient,
    private readonly auth: DouyuAuthContext,
  ) {}

  async checkIn(roomId: string, signal?: AbortSignal): Promise<void> {
    const authHeaders = await this.auth.headers('android');
    const response = await this.http.request({
      url: 'https://apiv2.douyucdn.cn/japi/roomuserlevel/apinc/checkIn?client_sys=android',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        aid: 'android1',
        ...authHeaders,
      },
      body: `rid=${encodeURIComponent(roomId)}`,
      signal,
      retry: 'safe',
    });
    const payload = await response.json<CheckInResponse>();
    if (Number(payload.error) !== 0) {
      const message = payload.msg ?? '房间签到失败';
      if (message.includes('登录')) throw new AppError('AUTH_EXPIRED', message);
      throw new AppError('UPSTREAM', message, { details: { error: payload.error, roomId } });
    }
  }
}
