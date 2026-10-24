import { AppError } from '../../errors';
import type { HttpClient } from '../../ports/HttpClient';

export interface FollowedRoom {
  roomId: string;
  name: string;
  isLive: boolean;
}

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
  liveOnly: boolean;
  signal?: AbortSignal;
}

export class FollowedRoomsQuery {
  constructor(private readonly http: HttpClient) {}

  async list(options: FollowedRoomsOptions): Promise<FollowedRoom[]> {
    const first = await this.fetchPage(1, options.signal);
    const pageCount = Math.min(Math.max(Number(first.data?.pageCount ?? 1), 1), 100);
    const result = new Map<string, FollowedRoom>();

    this.collect(first, options.liveOnly, result);
    for (let page = 2; page <= pageCount; page += 1) {
      if (options.signal?.aborted) throw new AppError('CANCELLED', '已取消');
      const response = await this.fetchPage(page, options.signal);
      this.collect(response, options.liveOnly, result);
    }

    return [...result.values()];
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
      throw new AppError('UPSTREAM', payload.msg ?? '关注列表获取失败', {
        details: { error: payload.error, page },
      });
    }
    return payload;
  }

  private collect(
    response: FollowListResponse,
    liveOnly: boolean,
    result: Map<string, FollowedRoom>,
  ): void {
    for (const item of response.data?.list ?? []) {
      const roomId = String(item.room_id ?? '').trim();
      if (!roomId) continue;
      const isLive = String(item.show_status ?? '0') === '1';
      if (liveOnly && !isLive) continue;
      if (!result.has(roomId)) {
        result.set(roomId, {
          roomId,
          name: item.room_name ?? item.nickname ?? `房间 ${roomId}`,
          isLive,
        });
      }
    }
  }
}
