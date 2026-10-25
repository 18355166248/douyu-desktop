import { AppError } from '../../errors';
import type { HttpClient } from '../../ports/HttpClient';
import type { DouyuAuthContext } from '../auth/DouyuAuthContext';

export type FansSignResult = 'signed' | 'already';

interface FansSignResponse {
  error?: number | string;
  msg?: string;
  message?: string;
}

interface FansSignReply {
  status: number;
  message: string;
  csrfFailed: boolean;
}

const SIGN_URL = 'https://www.douyu.com/japi/interactnc/web/fanshome/sign';

export class DouyuFansApi {
  constructor(
    private readonly http: HttpClient,
    private readonly auth: DouyuAuthContext,
  ) {}

  async sign(roomId: string, signal?: AbortSignal): Promise<FansSignResult> {
    let ctn = await this.auth.fansCtn();
    if (!ctn) {
      throw new AppError('AUTH_REQUIRED', '无法获取签到凭证，请重新登录斗鱼');
    }

    let reply = await this.post(roomId, ctn, signal);
    if (reply.csrfFailed) {
      ctn = await this.auth.fansCtn(true);
      if (!ctn) throw new AppError('AUTH_REQUIRED', '签到凭证已失效，请重新登录斗鱼');
      reply = await this.post(roomId, ctn, signal);
    }

    if (reply.csrfFailed) {
      throw new AppError('AUTH_EXPIRED', '签到凭证校验失败，请重新登录斗鱼');
    }

    const payload = parsePayload(reply.message);
    const message = payload.msg ?? payload.message ?? reply.message;
    if (Number(payload.error) === 0) return 'signed';
    if (message.includes('已签到')) return 'already';
    if (message.includes('登录')) throw new AppError('AUTH_EXPIRED', message);
    throw new AppError('UPSTREAM', message || '粉丝团签到失败', {
      details: { roomId, error: payload.error, status: reply.status },
    });
  }

  private async post(roomId: string, ctn: string, signal?: AbortSignal): Promise<FansSignReply> {
    const authHeaders = await this.auth.headers('web');
    const response = await this.http.request({
      url: SIGN_URL,
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `ctn=${encodeURIComponent(ctn)}&rid=${encodeURIComponent(roomId)}`,
      signal,
      retry: 'safe',
    });
    const message = await response.text();
    const payload = parsePayload(message);
    const text = payload.msg ?? payload.message ?? message;
    return {
      status: response.status,
      message,
      csrfFailed: response.status === 403 || text.includes('csrf auth failed'),
    };
  }
}

function parsePayload(raw: string): FansSignResponse {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as FansSignResponse;
    }
  } catch {
    // Non-JSON responses are surfaced through the original text.
  }
  return {};
}
