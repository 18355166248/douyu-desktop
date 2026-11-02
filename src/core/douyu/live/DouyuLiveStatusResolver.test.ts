import { describe, expect, it } from 'vitest';
import type { HttpClient, HttpRequest, HttpResponse } from '../../ports/HttpClient';
import { DouyuLiveStatusResolver } from './DouyuLiveStatusResolver';

function jsonResponse(data: unknown, status = 200): HttpResponse {
  return {
    status,
    headers: {},
    text: async () => JSON.stringify(data),
    json: async <T>() => data as T,
  };
}

describe('DouyuLiveStatusResolver', () => {
  it('reads room_status and the Beijing-time start_time of the current session', async () => {
    const requests: HttpRequest[] = [];
    const http: HttpClient = {
      request: async (request) => {
        requests.push(request);
        return jsonResponse({
          error: 0,
          data: { room_status: '1', start_time: '2026-11-02 12:58:09', videoLoop: 0 },
        });
      },
    };

    const result = await new DouyuLiveStatusResolver(http).resolve(' 9999 ');

    expect(result).toMatchObject({
      platform: 'douyu',
      roomId: '9999',
      live: true,
      liveSince: Date.UTC(2026, 10, 2, 4, 58, 9),
    });
    expect(requests[0]).toMatchObject({
      url: 'https://open.douyucdn.cn/api/RoomApi/room/9999',
      timeoutMs: 6000,
      retry: 'safe',
      headers: { Referer: 'https://www.douyu.com/9999' },
    });
  });

  it('keeps an offline room offline and drops its stale start time', async () => {
    const http: HttpClient = {
      request: async () =>
        jsonResponse({ error: 0, data: { room_status: '2', start_time: '2026-11-01 20:00:00' } }),
    };

    const result = await new DouyuLiveStatusResolver(http).resolve('9999');

    expect(result).toMatchObject({ live: false, liveSince: null });
  });

  it('reports an unknown state instead of guessing when the payload is unusable', async () => {
    const cases: HttpClient[] = [
      { request: async () => jsonResponse({ error: 102, msg: '房间不存在' }) },
      { request: async () => jsonResponse({ error: 0 }) },
      { request: async () => jsonResponse({ error: 0, data: {} }, 500) },
      {
        request: async () => {
          throw new Error('network down');
        },
      },
    ];

    for (const http of cases) {
      const result = await new DouyuLiveStatusResolver(http).resolve('9999');
      expect(result.live).toBeNull();
      expect(result.liveSince).toBeNull();
    }
  });

  it('treats a live room without a parseable start_time as live with no start', async () => {
    const http: HttpClient = {
      request: async () =>
        jsonResponse({ error: 0, data: { room_status: '1', start_time: '0000-00-00 00:00:00' } }),
    };

    const result = await new DouyuLiveStatusResolver(http).resolve('9999');

    expect(result).toMatchObject({ live: true, liveSince: null });
  });

  it('does not call the network for an empty room id', async () => {
    let called = false;
    const http: HttpClient = {
      request: async () => {
        called = true;
        return jsonResponse({ error: 0, data: {} });
      },
    };

    const result = await new DouyuLiveStatusResolver(http).resolve('   ');

    expect(called).toBe(false);
    expect(result.live).toBeNull();
  });
});
