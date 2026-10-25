import { MAX_FOLLOWED_ROOMS } from '@shared/contracts/follow';
import type { FollowedRoom } from '@shared/contracts/follow';
import { AppError } from '../../errors';
import type { HttpClient } from '../../ports/HttpClient';

interface FollowListResponse {
  error: number | string;
  msg?: string;
  data?: {
    pageCount?: number | string;
    total?: number | string;
    list?: Array<{
      room_id?: string | number;
      room_name?: string;
      nickname?: string;
      show_status?: string | number;
    }>;
  };
}

export interface FollowedRoomsOptions {
  signal?: AbortSignal;
  /** The follow list can be long; the home page only needs the first few pages. */
  maxPages?: number;
}

function clean(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

/**
 * Reads the rooms the active Douyu account follows. This endpoint also powers
 * the account health check, so an expired login is reported as AUTH_REQUIRED
 * instead of looking like an empty follow list.
 */
export class FollowedRoomsQuery {
  constructor(private readonly http: HttpClient) {}

  async list(options: FollowedRoomsOptions = {}): Promise<FollowedRoom[]> {
    const maxPages = Math.min(Math.max(options.maxPages ?? 5, 1), 10);
    const first = await this.fetchPage(1, options.signal);
    const pageCount = Math.min(Math.max(Number(first.data?.pageCount ?? 1), 1), maxPages);
    const result = new Map<string, FollowedRoom>();

    this.collect(first, result);
    for (let page = 2; page <= pageCount && result.size < MAX_FOLLOWED_ROOMS; page += 1) {
      if (options.signal?.aborted) throw new AppError('CANCELLED', '已取消');
      const response = await this.fetchPage(page, options.signal);
      this.collect(response, result);
    }

    return [...result.values()].slice(0, MAX_FOLLOWED_ROOMS);
  }

  private async fetchPage(page: number, signal?: AbortSignal): Promise<FollowListResponse> {
    const response = await this.http.request({
      url: `https://www.douyu.com/wgapi/livenc/liveweb/follow/list?page=${page}`,
      headers: { Referer: 'https://www.douyu.com/' },
      signal,
      retry: 'safe',
    });
    const payload = await response.json<FollowListResponse>();
    if (Number(payload.error) !== 0) {
      const message = payload.msg?.trim() || '关注列表获取失败';
      throw new AppError(/登录/.test(message) ? 'AUTH_REQUIRED' : 'UPSTREAM', message, {
        details: { error: payload.error, page },
      });
    }
    return payload;
  }

  private collect(response: FollowListResponse, result: Map<string, FollowedRoom>): void {
    for (const item of response.data?.list ?? []) {
      const roomId = String(item.room_id ?? '').trim();
      if (!roomId || result.has(roomId)) continue;
      const roomTitle = clean(item.room_name, 200);
      const anchorName = clean(item.nickname, 80);
      result.set(roomId, {
        platform: 'douyu',
        roomId,
        name: anchorName || roomTitle || `房间 ${roomId}`,
        title: roomTitle || anchorName || `房间 ${roomId}`,
        isLive: String(item.show_status ?? '0') === '1',
      });
    }
  }
}
