import { describe, expect, it } from 'vitest';
import type { HttpClient, HttpRequest, HttpResponse } from '../../ports/HttpClient';
import { BilibiliLiveStatusResolver } from './BilibiliLiveStatusResolver';

function jsonResponse(data: unknown, status = 200): HttpResponse {
  return {
    status,
    headers: {},
    text: async () => JSON.stringify(data),
    json: async <T>() => data as T,
  };
}

describe('BilibiliLiveStatusResolver', () => {
  it('reads live_status and live_time and echoes the requested room id', async () => {
    const requests: HttpRequest[] = [];
    const http: HttpClient = {
      request: async (request) => {
        requests.push(request);
        return jsonResponse({
          code: 0,
          data: { room_id: 7734200, live_status: 1, live_time: '2026-10-15 15:50:15' },
        });
      },
    };

    const result = await new BilibiliLiveStatusResolver(http).resolve(' 6 ');

    expect(result).toMatchObject({
      platform: 'bilibili',
      roomId: '6',
      live: true,
      liveSince: Date.UTC(2026, 9, 15, 7, 50, 15),
    });
    expect(requests[0]).toMatchObject({
      url: 'https://api.live.bilibili.com/room/v1/Room/get_info?room_id=6',
      headers: { Referer: 'https://live.bilibili.com/' },
      timeoutMs: 6000,
      retry: 'safe',
    });
  });

  it('drops live_time when the room is not live', async () => {
    const http: HttpClient = {
      request: async () =>
        jsonResponse({ code: 0, data: { live_status: 0, live_time: '2026-10-15 15:50:15' } }),
    };

    const result = await new BilibiliLiveStatusResolver(http).resolve('6');

    expect(result).toMatchObject({ live: false, liveSince: null });
  });

  it('reports unknown for upstream errors, bad status codes and network failures', async () => {
    const cases: HttpClient[] = [
      { request: async () => jsonResponse({ code: -400, message: 'room not exist' }) },
      { request: async () => jsonResponse({ code: 0 }, 502) },
      {
        request: async () => {
          throw new Error('offline');
        },
      },
    ];

    for (const http of cases) {
      const result = await new BilibiliLiveStatusResolver(http).resolve('6');
      expect(result).toMatchObject({ live: null, liveSince: null, roomId: '6' });
    }
  });

  it('keeps a live room live when live_time is the zero placeholder', async () => {
    const http: HttpClient = {
      request: async () =>
        jsonResponse({ code: 0, data: { live_status: 1, live_time: '0000-00-00 00:00:00' } }),
    };

    const result = await new BilibiliLiveStatusResolver(http).resolve('6');

    expect(result).toMatchObject({ live: true, liveSince: null });
  });
});
