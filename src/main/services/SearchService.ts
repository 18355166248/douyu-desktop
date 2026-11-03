import { session } from 'electron';
import { MAX_SEARCH_KEYWORD_LENGTH } from '@shared/contracts/search';
import type { RoomSearchItem } from '@shared/contracts/search';
import { DouyuSearchQuery } from '@core/douyu/queries/DouyuSearchQuery';
import { DouyuHttpClient } from '@core/http/DouyuHttpClient';
import { CHROME_UA } from '../constants';
import { SessionHttpClient } from '../adapters/electron/SessionHttpClient';

/** 短时间内重复输入同一关键词时直接复用结果，避免反复打上游。 */
const CACHE_TTL_MS = 60_000;
const CACHE_LIMIT = 24;

export class SearchService {
  private readonly http: DouyuHttpClient;
  private readonly cache = new Map<string, { at: number; items: RoomSearchItem[] }>();
  private readonly inFlight = new Map<string, Promise<RoomSearchItem[]>>();

  constructor() {
    // 搜索是公开接口，未登录也要能用，因此走默认会话而不是账号会话。
    this.http = new DouyuHttpClient(new SessionHttpClient(session.defaultSession, CHROME_UA), {
      minIntervalMs: 250,
      maxAttempts: 2,
    });
  }

  async rooms(keyword: string): Promise<RoomSearchItem[]> {
    const query = keyword.trim().slice(0, MAX_SEARCH_KEYWORD_LENGTH);
    if (!query) return [];

    const cached = this.cache.get(query);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.items;

    const pending = this.inFlight.get(query);
    if (pending) return pending;

    const request = new DouyuSearchQuery(this.http)
      .search(query)
      .then((items) => {
        this.remember(query, items);
        return items;
      })
      .finally(() => {
        this.inFlight.delete(query);
      });
    this.inFlight.set(query, request);
    return request;
  }

  private remember(query: string, items: RoomSearchItem[]): void {
    // 重新插入到 Map 末尾，让「最近使用」保持在淘汰顺序的最后。
    this.cache.delete(query);
    this.cache.set(query, { at: Date.now(), items });
    while (this.cache.size > CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }
}
