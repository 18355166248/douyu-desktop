import { AppError } from '../../errors';
import type { HttpClient, HttpResponse } from '../../ports/HttpClient';
import type { DouyuAuthContext } from '../auth/DouyuAuthContext';

/** 观时积分活动标识；斗鱼每次换活动只改这个 alias。 */
export const WATCH_POINTS_ACT_ALIAS = '20250521OPFOY';

const VIEW_STATUS_URL = 'https://www.douyu.com/wgapi/activitync/gametask/viewStatus';
const TAKE_GIFT_URL = 'https://www.douyu.com/wgapi/activitync/gametask/takeGift';
const PROP_RED_PACKET_LIST_URL =
  'https://www.douyu.com/japi/interactnc/web/propredpacket/getPrpList?type_id=1&room_id=';
const PROP_RED_PACKET_GRAB_URL = 'https://www.douyu.com/japi/interactnc/web/propredpacket/grab_prp';

export interface WatchPointsStatus {
  /** 活动开始时间，领取时要原样回传。 */
  startTime: string;
  /** 状态为 2 的任务即「已完成、可领取」。 */
  claimableIds: string[];
  /** 活动里可见的任务总数，用来区分「没有可领取」和「活动已下线」。 */
  taskCount: number;
}

export interface RedPacketItem {
  activityId: string;
  /** 红包开始时间（epoch ms），未知为 null。 */
  startTime: number | null;
}

interface ViewStatusPayload {
  error?: number | string;
  data?: {
    startTime?: string | number;
    taskList?: Record<string, { status?: number | string }>;
  };
}

interface RedPacketListPayload {
  error?: number | string;
  data?: {
    list?: Array<{ activityid?: string | number; startTime?: string | number }>;
  };
}

async function readJson<T>(response: HttpResponse): Promise<T | null> {
  try {
    return await response.json<T>();
  } catch {
    return null;
  }
}

function toEpochMs(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric > 1e12 ? numeric : numeric * 1000;
}

export function parseWatchPointsStatus(payload: ViewStatusPayload): WatchPointsStatus {
  const data = payload.data;
  if (!data) throw new AppError('UPSTREAM', '积分任务状态获取失败');
  const taskList = data.taskList ?? {};
  const claimableIds = Object.entries(taskList)
    .filter(([, task]) => Number(task?.status) === 2)
    .map(([id]) => id);
  return {
    startTime: String(data.startTime ?? ''),
    claimableIds,
    taskCount: Object.keys(taskList).length,
  };
}

export function parseRedPacketList(payload: RedPacketListPayload): RedPacketItem[] {
  const list = payload.data?.list;
  if (!Array.isArray(list)) return [];
  const items: RedPacketItem[] = [];
  for (const entry of list) {
    const activityId = String(entry.activityid ?? '').trim();
    if (!activityId) continue;
    items.push({ activityId, startTime: toEpochMs(entry.startTime) });
  }
  return items;
}

/** `isSuc === 2` 是斗鱼的「还没抢完，继续抢」，不是失败。 */
export function parseRedPacketGrab(payload: {
  data?: { isSuc?: number | string; msg?: string; silver?: number | string };
}): { status: 'claimed' | 'retry' | 'none'; message: string } {
  const data = payload.data;
  if (!data) return { status: 'none', message: '红包接口没有返回数据' };
  const isSuc = Number(data.isSuc);
  if (isSuc === 2) return { status: 'retry', message: data.msg?.trim() || '继续抢' };
  const silver = Number(data.silver);
  const message = data.msg?.trim() || '';
  if (Number.isFinite(silver) && silver > 0) return { status: 'claimed', message: `${silver}鱼丸` };
  if (message) return { status: 'claimed', message };
  return { status: 'none', message: '红包已抢完' };
}

/**
 * 房间礼物红包：`getPrpList` 列出当前房间的红包活动，`grab_prp` 领取。
 * 两者都是纯 HTTP，只需要当前账号的 Cookie 与 ctn，因此可以放在主进程里定时轮询。
 */
export class DouyuClaimApi {
  constructor(
    private readonly http: HttpClient,
    private readonly auth: DouyuAuthContext,
  ) {}

  async watchPointsStatus(ctn: string, signal?: AbortSignal): Promise<WatchPointsStatus> {
    const headers = await this.auth.headers('web');
    const response = await this.http.request({
      url: VIEW_STATUS_URL,
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `ctn=${encodeURIComponent(ctn)}&actAlias=${WATCH_POINTS_ACT_ALIAS}`,
      signal,
      retry: 'safe',
    });
    const payload = (await readJson<ViewStatusPayload>(response)) ?? {};
    if (response.status !== 200) {
      throw new AppError('UPSTREAM', `积分任务状态获取失败（HTTP ${response.status}）`);
    }
    return parseWatchPointsStatus(payload);
  }

  async watchPointsTakeGift(
    ctn: string,
    id: string,
    startTime: string,
    signal?: AbortSignal,
  ): Promise<{ claimed: boolean; message: string }> {
    const headers = await this.auth.headers('web');
    const response = await this.http.request({
      url: TAKE_GIFT_URL,
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: [
        `ctn=${encodeURIComponent(ctn)}`,
        `id=${encodeURIComponent(id)}`,
        `actAlias=${WATCH_POINTS_ACT_ALIAS}`,
        `startTime=${encodeURIComponent(startTime)}`,
      ].join('&'),
      signal,
      retry: 'safe',
    });
    const payload = (await readJson<{ error?: number | string; msg?: string }>(response)) ?? {};
    const message = payload.msg?.trim() ?? '';
    if (message.includes('登录')) throw new AppError('AUTH_EXPIRED', message);
    const error = Number(payload.error);
    if (error === 0) return { claimed: true, message: message || '积分领取成功' };
    // 31200 是斗鱼「本次已领取过」的状态码，不是失败。
    if (error === 31200) return { claimed: false, message: message || '积分已领取过' };
    throw new AppError('UPSTREAM', message || '积分领取失败', { details: { error } });
  }

  async redPacketList(roomId: string, signal?: AbortSignal): Promise<RedPacketItem[]> {
    const headers = await this.auth.headers('web');
    const response = await this.http.request({
      url: `${PROP_RED_PACKET_LIST_URL}${encodeURIComponent(roomId)}`,
      headers: { ...headers, Referer: `https://www.douyu.com/${encodeURIComponent(roomId)}` },
      signal,
      retry: 'safe',
    });
    if (response.status !== 200) {
      throw new AppError('UPSTREAM', `红包列表获取失败（HTTP ${response.status}）`);
    }
    const payload = (await readJson<RedPacketListPayload>(response)) ?? {};
    return parseRedPacketList(payload);
  }

  async redPacketGrab(
    ctn: string,
    activityId: string,
    signal?: AbortSignal,
  ): Promise<{ status: 'claimed' | 'retry' | 'none'; message: string }> {
    const headers = await this.auth.headers('web');
    const response = await this.http.request({
      url: PROP_RED_PACKET_GRAB_URL,
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `activityid=${encodeURIComponent(activityId)}&ctn=${encodeURIComponent(ctn)}`,
      signal,
      retry: 'safe',
    });
    const payload =
      (await readJson<{ data?: { isSuc?: number | string; msg?: string; silver?: number | string } }>(
        response,
      )) ?? {};
    if (response.status !== 200) {
      throw new AppError('UPSTREAM', `红包领取失败（HTTP ${response.status}）`);
    }
    return parseRedPacketGrab(payload);
  }
}
