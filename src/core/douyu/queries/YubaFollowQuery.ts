import { AppError } from '../../errors';
import type { HttpClient } from '../../ports/HttpClient';
import type { DouyuAuthContext } from '../auth/DouyuAuthContext';

export interface YubaGroup {
  groupId: string;
  name: string;
}

interface YubaFollowResponse {
  message?: string;
  data?: {
    count_page?: number | string;
    list?: Array<{ group_id?: string | number; group_name?: string }>;
  };
}

const MY_FOLLOW_URL = 'https://yuba.douyu.com/wbapi/web/group/myFollow';
const PAGE_LIMIT = 30;
const MAX_PAGES = 10;

function parsePage(payload: YubaFollowResponse): {
  groups: YubaGroup[];
  pageCount: number;
} {
  const list = payload.data?.list;
  const groups: YubaGroup[] = [];
  if (Array.isArray(list)) {
    for (const entry of list) {
      const groupId = String(entry.group_id ?? '').trim();
      if (!groupId) continue;
      const name = entry.group_name?.trim() || `鱼吧 ${groupId}`;
      groups.push({ groupId, name });
    }
  }
  const pageCount = Number(payload.data?.count_page ?? 1);
  return {
    groups,
    pageCount: Number.isFinite(pageCount) && pageCount > 0 ? pageCount : 1,
  };
}

/**
 * 鱼吧签到需要先拿到「我关注/加入的鱼吧」列表。斗鱼没有 JSON 版的一键列表，
 * 只有这个分页接口，因此按页读取并去重。
 */
export class YubaFollowQuery {
  constructor(
    private readonly http: HttpClient,
    private readonly auth: DouyuAuthContext,
  ) {}

  async list(signal?: AbortSignal): Promise<YubaGroup[]> {
    const headers = await this.auth.headers('yuba');
    const result = new Map<string, YubaGroup>();

    let page = 1;
    let pageCount = 1;
    do {
      if (signal?.aborted) throw new AppError('CANCELLED', '已取消');
      const response = await this.http.request({
        url: `${MY_FOLLOW_URL}?page=${page}&limit=${PAGE_LIMIT}`,
        headers,
        signal,
        retry: 'safe',
      });
      if (response.status !== 200) {
        throw new AppError('UPSTREAM', `鱼吧列表获取失败（HTTP ${response.status}）`);
      }
      const payload = await response.json<YubaFollowResponse>();
      const parsed = parsePage(payload);
      if (page === 1) pageCount = Math.min(Math.max(parsed.pageCount, 1), MAX_PAGES);
      for (const group of parsed.groups) {
        if (!result.has(group.groupId)) result.set(group.groupId, group);
      }
      if (parsed.groups.length === 0) break;
      page += 1;
    } while (page <= pageCount);

    return [...result.values()];
  }
}
