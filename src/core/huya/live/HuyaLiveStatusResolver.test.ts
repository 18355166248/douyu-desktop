import { describe, expect, it } from 'vitest';
import type { HttpClient, HttpRequest, HttpResponse } from '../../ports/HttpClient';
import { HuyaLiveStatusResolver } from './HuyaLiveStatusResolver';

function jsonResponse(data: unknown, status = 200): HttpResponse {
  return {
    status,
    headers: {},
    text: async () => JSON.stringify(data),
    json: async <T>() => data as T,
  };
}

describe('HuyaLiveStatusResolver', () => {
  it('converts liveData.startTime seconds into the epoch of the current session', async () => {
    const requests: HttpRequest[] = [];
    const http: HttpClient = {
      request: async (request) => {
        requests.push(request);
        return jsonResponse({
          status: 200,
          data: { liveStatus: 'ON', realLiveStatus: 'ON', liveData: { startTime: 1793092036 } },
        });
      },
    };

    const result = await new HuyaLiveStatusResolver(http).resolve(' 660000 ');

    expect(result).toMatchObject({
      platform: 'huya',
      roomId: '660000',
      live: true,
      liveSince: 1_793_092_036_000,
    });
    expect(requests[0]).toMatchObject({
      url: 'https://mp.huya.com/cache.php?m=Live&do=profileRoom&roomid=660000',
      headers: { Referer: 'https://www.huya.com/660000' },
      timeoutMs: 6000,
      retry: 'safe',
    });
  });

  it('accepts millisecond timestamps as well', async () => {
    const http: HttpClient = {
      request: async () =>
        jsonResponse({ status: 200, data: { liveStatus: 'ON', liveData: { startTime: 1_793_092_036_000 } } }),
    };

    const result = await new HuyaLiveStatusResolver(http).resolve('660000');

    expect(result.liveSince).toBe(1_793_092_036_000);
  });

  it('treats REPLAY and OFF as not live and drops their start time', async () => {
    for (const state of ['REPLAY', 'OFF']) {
      const http: HttpClient = {
        request: async () =>
          jsonResponse({ status: 200, data: { liveStatus: state, liveData: { startTime: 1793092036 } } }),
      };
      const result = await new HuyaLiveStatusResolver(http).resolve('660000');
      expect(result).toMatchObject({ live: false, liveSince: null });
    }
  });

  it('reports unknown for unusable payloads', async () => {
    const cases: HttpClient[] = [
      { request: async () => jsonResponse({ status: 404, message: 'not found' }) },
      { request: async () => jsonResponse({ status: 200, data: {} }, 500) },
      {
        request: async () => {
          throw new Error('offline');
        },
      },
    ];

    for (const http of cases) {
      const result = await new HuyaLiveStatusResolver(http).resolve('660000');
      expect(result).toMatchObject({ live: null, liveSince: null });
    }
  });

  it('ignores implausible start timestamps while keeping the room live', async () => {
    const http: HttpClient = {
      request: async () =>
        jsonResponse({ status: 200, data: { liveStatus: 'ON', liveData: { startTime: 12 } } }),
    };

    const result = await new HuyaLiveStatusResolver(http).resolve('660000');

    expect(result).toMatchObject({ live: true, liveSince: null });
  });
});
