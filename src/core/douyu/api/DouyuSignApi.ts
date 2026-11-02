import { AppError } from '../../errors';
import type { HttpClient, HttpResponse } from '../../ports/HttpClient';
import type { DouyuAuthContext } from '../auth/DouyuAuthContext';

export interface ClientSignOutcome {
  status: 'signed' | 'already';
  /** 平台返回的奖励描述，例如「10个鱼丸」。 */
  items: string[];
}

export interface YubaSignOutcome {
  status: 'signed' | 'already';
  exp: number | null;
  continuousDays: number | null;
}

interface ClientSignPayload {
  error?: number | string;
  msg?: string;
  data?: { sign_pl?: Array<{ name?: string; cnt?: number | string }> } | unknown[] | null;
}

interface YubaSignPayload {
  message?: string;
  data?: {
    count?: number | string;
    exp?: number | string;
    supplementary_cards?: number | string;
  } | null;
}

const H5_SIGN_URL = 'https://apiv2.douyucdn.cn/h5nc/sign/sendSign';
const YUBA_SIGN_URL = 'https://yuba.douyu.com/ybapi/topic/sign';
const YUBA_FAST_SIGN_URL = 'https://mapi-yuba.douyu.com/wb/v3/fastSign';
const YUBA_SUPPLEMENT_URL = 'https://mapi-yuba.douyu.com/wb/v3/supplement';
const DFANS_SIGN_URL = 'https://www.douyu.com/japi/interactnc/web/dfansact/userSign';

async function readJson<T>(response: HttpResponse): Promise<T | null> {
  try {
    return await response.json<T>();
  } catch {
    return null;
  }
}

function toCount(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return numeric;
}

/**
 * Ports the HTTP parts of DouyuEx's 一键签到: 客户端签到 (h5nc)、鱼吧签到
 * (含火速签到与补签)、钻粉联赛签到。这些接口都只依赖当前账号 Cookie/Token，
 * 不需要网页播放器，因此可以放在主进程里跑。
 */
export function parseClientSign(payload: ClientSignPayload): ClientSignOutcome {
  const data = payload.data;
  if (Array.isArray(data) && data.length === 0) return { status: 'already', items: [] };

  const rewardList =
    data && !Array.isArray(data) && Array.isArray(data.sign_pl) ? data.sign_pl : [];
  const items: string[] = [];
  for (const reward of rewardList) {
    const name = typeof reward.name === 'string' ? reward.name.trim() : '';
    const count = toCount(reward.cnt);
    if (!name || count === null || count <= 0) continue;
    items.push(`${count}个${name}`);
  }

  // 斗鱼在「今日已签到」时返回空数组或空对象，不会给出 sign_pl。
  return { status: items.length > 0 ? 'signed' : 'already', items };
}

export function parseYubaSign(message: string, payload: YubaSignPayload): YubaSignOutcome {
  const text = message.trim();
  if (text === '' || text === 'success') {
    return {
      status: 'signed',
      exp: toCount(payload.data?.exp),
      continuousDays: toCount(payload.data?.count),
    };
  }
  if (text.includes('已签到') || text.includes('重复签到')) {
    return { status: 'already', exp: null, continuousDays: null };
  }
  throw new AppError('UPSTREAM', text || '鱼吧签到失败');
}

export function parseYubaSupplementCards(payload: YubaSignPayload): number {
  return toCount(payload.data?.supplementary_cards) ?? 0;
}

export class DouyuSignApi {
  constructor(
    private readonly http: HttpClient,
    private readonly auth: DouyuAuthContext,
  ) {}

  /** 客户端签到：`data.sign_pl` 为空即代表今天已经签过。 */
  async clientSign(signal?: AbortSignal): Promise<ClientSignOutcome> {
    const headers = await this.auth.headers('android');
    const token = headers.token ?? '';
    const response = await this.http.request({
      url: H5_SIGN_URL,
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `token=${encodeURIComponent(token)}`,
      signal,
      retry: 'safe',
    });
    const payload = (await readJson<ClientSignPayload>(response)) ?? {};
    if (response.status !== 200) {
      throw new AppError('UPSTREAM', `客户端签到失败（HTTP ${response.status}）`);
    }
    const message = typeof payload.msg === 'string' ? payload.msg : '';
    if (message.includes('登录')) throw new AppError('AUTH_EXPIRED', message);
    return parseClientSign(payload);
  }

  /** 鱼吧「火速签到」：7 级以上鱼吧一次签完，失败不影响逐个签到。 */
  async yubaFastSign(signal?: AbortSignal): Promise<{ signed: number }> {
    const token = (await this.auth.headers('yuba'))['dy-token'] ?? '';
    const response = await this.http.request({
      url: YUBA_FAST_SIGN_URL,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', client: 'android', token },
      signal,
      retry: 'safe',
    });
    const payload = await readJson<{ message?: string; data?: number | string }>(response);
    const signed = toCount(payload?.data) ?? 0;
    return { signed };
  }

  /** 单个鱼吧签到。`签到失败` 需要重试，交给调用方决定次数。 */
  async yubaSign(groupId: string, signal?: AbortSignal): Promise<YubaSignOutcome> {
    const headers = await this.auth.headers('yuba');
    const response = await this.http.request({
      url: YUBA_SIGN_URL,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: `https://yuba.douyu.com/group/${encodeURIComponent(groupId)}`,
      },
      body: `group_id=${encodeURIComponent(groupId)}`,
      signal,
      retry: 'safe',
    });
    const payload = (await readJson<YubaSignPayload>(response)) ?? {};
    const message = typeof payload.message === 'string' ? payload.message : '';
    if (message.includes('登录')) throw new AppError('AUTH_EXPIRED', message);
    if (response.status !== 200) {
      throw new AppError('UPSTREAM', `鱼吧签到失败（HTTP ${response.status}）`);
    }
    return parseYubaSign(message, payload);
  }

  /** 补签：返回还可以补签的张数，调用方按张数循环。 */
  async yubaSupplement(groupId: string, signal?: AbortSignal): Promise<number> {
    const token = (await this.auth.headers('yuba'))['dy-token'] ?? '';
    const response = await this.http.request({
      url: YUBA_SUPPLEMENT_URL,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', client: 'android', token },
      body: `group_id=${encodeURIComponent(groupId)}`,
      signal,
      retry: 'safe',
    });
    const payload = (await readJson<YubaSignPayload>(response)) ?? {};
    return parseYubaSupplementCards(payload);
  }

  /** 钻粉联赛签到：对每个已加入粉丝团的房间各调用一次。 */
  async diamondFansSign(
    roomId: string,
    ctn: string,
    signal?: AbortSignal,
  ): Promise<{ signed: number; message: string }> {
    const headers = await this.auth.headers('web');
    const response = await this.http.request({
      url: DFANS_SIGN_URL,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: `https://www.douyu.com/${encodeURIComponent(roomId)}`,
      },
      body: `ctn=${encodeURIComponent(ctn)}&rid=${encodeURIComponent(roomId)}`,
      signal,
      retry: 'safe',
    });
    const payload = (await readJson<{ error?: number | string; msg?: string }>(response)) ?? {};
    const message = payload.msg?.trim() ?? '';
    const error = Number(payload.error);
    if (message.includes('登录')) throw new AppError('AUTH_EXPIRED', message || '请重新登录斗鱼');
    if (response.status === 403) throw new AppError('AUTH_EXPIRED', '签到凭证校验失败，请重新登录斗鱼');
    if (response.status !== 200) {
      throw new AppError('UPSTREAM', `钻粉联赛签到失败（HTTP ${response.status}）`);
    }
    if (error === 0) return { signed: 1, message };
    if (message.includes('已签到')) return { signed: 0, message };
    throw new AppError('UPSTREAM', message || '钻粉联赛签到失败', { details: { error } });
  }
}
