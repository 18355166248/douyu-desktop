import { MAX_SEARCH_KEYWORD_LENGTH, MAX_SEARCH_RESULTS } from '@shared/contracts/search';
import type { RoomSearchItem } from '@shared/contracts/search';
import { AppError, toAppError } from '../../errors';
import type { HttpClient } from '../../ports/HttpClient';
import { parseDouyuHeat } from '../heat';

const SEARCH_ENDPOINT = 'https://www.douyu.com/japi/search/api';
/** 上游一页返回多少条；两个接口都只取首页，够首页展示即可。 */
const PAGE_SIZE = 10;

interface SearchShowItem {
  rid?: string | number;
  nickName?: string;
  roomName?: string;
  roomSrc?: string;
  cateName?: string;
  isLive?: string | number;
  hot?: string | number;
  videoLoop?: string | number;
  isLoop?: string | number;
  fansNum?: string | number;
  fansNumStr?: string;
  followerCount?: string;
}

interface SearchResponse {
  error?: number | string;
  msg?: string;
  data?: {
    /** 直播间搜索（searchShow）的结果。 */
    relateShow?: SearchShowItem[];
    /** 主播搜索（searchUser）的结果。 */
    relateUser?: Array<{ anchorInfo?: SearchShowItem }>;
  };
}

export interface DouyuSearchOptions {
  signal?: AbortSignal;
  /** 合并去重后最多返回多少条。 */
  limit?: number;
}

function clean(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function cleanUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  let url = value.trim();
  if (url.startsWith('//')) url = `https:${url}`;
  if (url.startsWith('http://')) url = `https://${url.slice(7)}`;
  if (!url.startsWith('https://')) return undefined;
  return url.slice(0, 500);
}

/**
 * 同一个房间既命中主播搜索又命中直播间搜索时，用直播间结果补全主播结果：
 * 主播接口不返回直播间标题和当前封面，只保留它特有的粉丝数。
 */
function mergeRoomHit(anchor: RoomSearchItem, room: RoomSearchItem): RoomSearchItem {
  const cover = room.cover ?? anchor.cover;
  const category = anchor.category ?? room.category;
  return {
    ...anchor,
    // 主播结果的标题只是昵称兜底，只有直播间结果带真实标题时才替换。
    title: anchor.title === anchor.name && room.title !== room.name ? room.title : anchor.title,
    heat: anchor.heat || room.heat,
    hasVideo: anchor.hasVideo || room.hasVideo,
    isLive: anchor.isLive || room.isLive,
    ...(cover ? { cover } : {}),
    ...(category ? { category } : {}),
  };
}

/**
 * 按斗鱼搜索接口的关键词命中主播名或直播间。
 *
 * 主播搜索（searchUser）负责「输入主播名」的场景，直播间搜索（searchShow）
 * 补充标题/分区命中的房间；两个接口任意一个失败都只降级一半结果，
 * 只有两端都失败才向外抛错。
 */
export class DouyuSearchQuery {
  constructor(private readonly http: HttpClient) {}

  async search(keyword: string, options: DouyuSearchOptions = {}): Promise<RoomSearchItem[]> {
    const query = keyword.trim().slice(0, MAX_SEARCH_KEYWORD_LENGTH);
    if (!query) return [];

    const [anchors, rooms] = await Promise.allSettled([
      this.fetch('searchUser', query, options.signal),
      this.fetch('searchShow', query, options.signal),
    ]);
    if (options.signal?.aborted) throw new AppError('CANCELLED', '已取消');
    if (anchors?.status === 'rejected' && rooms?.status === 'rejected') {
      throw toAppError(anchors.reason);
    }

    const limit = Math.min(Math.max(options.limit ?? MAX_SEARCH_RESULTS, 1), MAX_SEARCH_RESULTS);
    const merged = new Map<string, RoomSearchItem>();
    // 主播结果优先：用户输入主播名时，最想看到的就是主播本人。
    if (anchors?.status === 'fulfilled') {
      for (const entry of anchors.value.data?.relateUser ?? []) {
        const item = this.toItem(entry.anchorInfo, 'anchor');
        if (item && !merged.has(item.roomId)) merged.set(item.roomId, item);
      }
    }
    if (rooms?.status === 'fulfilled') {
      for (const entry of rooms.value.data?.relateShow ?? []) {
        const item = this.toItem(entry, 'room');
        if (!item) continue;
        const existing = merged.get(item.roomId);
        // 主播搜索不返回直播间标题，重复房间用直播间结果补全。
        if (!existing) merged.set(item.roomId, item);
        else if (existing.match === 'anchor') merged.set(item.roomId, mergeRoomHit(existing, item));
      }
    }
    return [...merged.values()].slice(0, limit);
  }

  private async fetch(
    path: 'searchUser' | 'searchShow',
    query: string,
    signal: AbortSignal | undefined,
  ): Promise<SearchResponse> {
    const params = new URLSearchParams({
      kw: query,
      page: '1',
      pageSize: String(PAGE_SIZE),
    });
    const response = await this.http.request({
      url: `${SEARCH_ENDPOINT}/${path}?${params.toString()}`,
      headers: { Referer: 'https://www.douyu.com/' },
      signal,
      retry: 'safe',
    });
    const payload = await response.json<SearchResponse>();
    if (payload.error !== undefined && Number(payload.error) !== 0) {
      throw new AppError('UPSTREAM', payload.msg?.trim() || '搜索失败', {
        details: { path, error: payload.error },
      });
    }
    return payload;
  }

  private toItem(raw: SearchShowItem | undefined, match: 'anchor' | 'room'): RoomSearchItem | null {
    if (!raw) return null;
    const roomId = String(raw.rid ?? '').trim();
    // 没有房间号的结果无法打开，也没有意义。
    if (!/^[1-9]\d{0,31}$/.test(roomId)) return null;

    const roomTitle = clean(raw.roomName, 200);
    const anchorName = clean(raw.nickName, 80);
    const cover = cleanUrl(raw.roomSrc);
    const category = clean(raw.cateName, 40);
    const fansText = clean(raw.fansNumStr, 24) || clean(raw.followerCount, 24);

    return {
      platform: 'douyu',
      roomId,
      name: anchorName || roomTitle || `房间 ${roomId}`,
      title: roomTitle || anchorName || `房间 ${roomId}`,
      isLive: Number(raw.isLive ?? 0) === 1,
      hasVideo: Number(raw.videoLoop ?? 0) === 1 || Number(raw.isLoop ?? 0) === 1,
      heat: parseDouyuHeat(raw.hot),
      match,
      ...(cover ? { cover } : {}),
      ...(category ? { category } : {}),
      ...(fansText && fansText !== '0' ? { fansText } : {}),
    };
  }
}
