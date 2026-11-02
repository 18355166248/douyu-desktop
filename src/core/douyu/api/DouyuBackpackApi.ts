import { AppError } from '../../errors';
import type { HttpClient, HttpResponse } from '../../ports/HttpClient';
import type { DouyuAuthContext } from '../auth/DouyuAuthContext';

const BACKPACK_URL = 'https://www.douyu.com/japi/prop/backpack/web/v5?rid=';
const DONATE_URL = 'https://www.douyu.com/japi/prop/donate/mainsite/v1';
/** 斗鱼活动来源字段，直播间送礼固定传空的 yzxq。 */
const BIZ_EXT = encodeURIComponent(JSON.stringify({ yzxq: {} }));

export interface BackpackGift {
  propId: string;
  name: string;
  count: number;
  /** `batchInfo` 非空时斗鱼支持一次送完全部数量，否则只能一个一个送。 */
  batchable: boolean;
  /** 单件价格（分）；`isValuable=1` 时才有意义。 */
  price: number;
  /** 单件亲密度。 */
  intimate: number;
  valuable: boolean;
}

export interface BackpackSummary {
  gifts: BackpackGift[];
  /** 礼物总件数（所有礼物数量之和）。 */
  units: number;
  /** 有价值的礼物总价（元），无价值礼物不计。 */
  valueYuan: number;
  /** 总亲密度。 */
  intimate: number;
}

interface BackpackPayload {
  error?: number | string;
  msg?: string;
  data?: {
    list?: Array<{
      id?: string | number;
      name?: string;
      count?: string | number;
      price?: string | number;
      intimate?: string | number;
      isValuable?: string | number;
      batchInfo?: Record<string, unknown> | null;
    }>;
  };
}

async function readJson<T>(response: HttpResponse): Promise<T | null> {
  try {
    return await response.json<T>();
  } catch {
    return null;
  }
}

function toNumber(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function parseBackpack(payload: BackpackPayload): BackpackSummary {
  const list = payload.data?.list;
  const gifts: BackpackGift[] = [];
  if (Array.isArray(list)) {
    for (const entry of list) {
      const propId = String(entry.id ?? '').trim();
      const count = Math.floor(toNumber(entry.count));
      if (!propId || count <= 0) continue;
      gifts.push({
        propId,
        name: entry.name?.trim() || `礼物 ${propId}`,
        count,
        batchable: Boolean(entry.batchInfo && Object.keys(entry.batchInfo).length > 0),
        price: Math.max(0, toNumber(entry.price)),
        intimate: Math.max(0, toNumber(entry.intimate)),
        valuable: String(entry.isValuable ?? '') === '1',
      });
    }
  }

  let units = 0;
  let cents = 0;
  let intimate = 0;
  for (const gift of gifts) {
    units += gift.count;
    intimate += gift.intimate * gift.count;
    if (gift.valuable) cents += gift.price * gift.count;
  }
  return { gifts, units, valueYuan: Math.round(cents) / 100, intimate };
}

/**
 * 背包礼物：`backpack/web/v5` 列出当前房间可送的礼物，`prop/donate/mainsite/v1`
 * 从背包送出（不消耗鱼翅）。这两个接口是 douyuEx「清空背包」用的同一组。
 */
export class DouyuBackpackApi {
  constructor(
    private readonly http: HttpClient,
    private readonly auth: DouyuAuthContext,
  ) {}

  async list(roomId: string, signal?: AbortSignal): Promise<BackpackSummary> {
    const headers = await this.auth.headers('web');
    const response = await this.http.request({
      url: `${BACKPACK_URL}${encodeURIComponent(roomId)}`,
      headers: { ...headers, Referer: `https://www.douyu.com/${encodeURIComponent(roomId)}` },
      signal,
      retry: 'safe',
    });
    if (response.status !== 200) {
      throw new AppError('UPSTREAM', `背包礼物获取失败（HTTP ${response.status}）`);
    }
    const payload = (await readJson<BackpackPayload>(response)) ?? {};
    return parseBackpack(payload);
  }

  /** 送出背包礼物；`msg === 'success'` 才算成功。 */
  async donate(
    roomId: string,
    propId: string,
    count: number,
    signal?: AbortSignal,
  ): Promise<{ ok: boolean; message: string }> {
    const headers = await this.auth.headers('web');
    const response = await this.http.request({
      url: DONATE_URL,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: `https://www.douyu.com/${encodeURIComponent(roomId)}`,
      },
      body: `propId=${encodeURIComponent(propId)}&propCount=${count}&roomId=${encodeURIComponent(roomId)}&bizExt=${BIZ_EXT}`,
      signal,
      retry: 'safe',
    });
    const payload =
      (await readJson<{ error?: number | string; msg?: string; message?: string }>(response)) ?? {};
    const message = (payload.msg ?? payload.message ?? '').trim();
    if (message.includes('登录')) throw new AppError('AUTH_EXPIRED', message);
    if (response.status !== 200) {
      return { ok: false, message: message || `赠送失败（HTTP ${response.status}）` };
    }
    if (Number(payload.error) !== 0) {
      return { ok: false, message: message || '赠送失败' };
    }
    return { ok: message === 'success' || message === '', message: message || 'success' };
  }
}
