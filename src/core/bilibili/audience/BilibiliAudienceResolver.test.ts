import { describe, expect, it } from 'vitest';
import type { HttpClient, HttpRequest, HttpResponse } from '../../ports/HttpClient';
import { BilibiliAudienceResolver } from './BilibiliAudienceResolver';

function jsonResponse(data: unknown): HttpResponse {
  return {
    status: 200,
    headers: {},
    text: async () => JSON.stringify(data),
    json: async <T>() => data as T,
  };
}

describe('BilibiliAudienceResolver', () => {
  it('preserves Bilibili metric meanings and resolves a short room id', async () => {
    const requests: HttpRequest[] = [];
    const signal = new AbortController().signal;
    const http: HttpClient = {
      request: async (request) => {
        requests.push(request);
        return jsonResponse({
          code: '0',
          data: {
            room_info: { room_id: 21686237, online: 12345 },
            guard_info: { count: '314' },
            watched_show: { num: 56789 },
            anchor_info: { relation_info: { attention: 98765 } },
          },
        });
      },
    };
    const result = await new BilibiliAudienceResolver(http).resolve(' 6 ', signal);
    expect(result).toMatchObject({ platform: 'bilibili', roomId: '21686237' });
    expect(result.metrics.map(({ key, value, unit }) => ({ key, value, unit }))).toEqual([
      { key: 'highEnergy', value: null, unit: '人' },
      { key: 'guards', value: 314, unit: '人' },
      { key: 'watched', value: 56789, unit: '人' },
      { key: 'followers', value: 98765, unit: '人' },
      { key: 'popularity', value: 12345, unit: '热度' },
    ]);
    expect(requests[0]).toMatchObject({
      url: 'https://api.live.bilibili.com/xlive/web-room/v1/index/getInfoByRoom?room_id=6',
      signal,
      timeoutMs: 8000,
      retry: 'safe',
      headers: { Referer: 'https://live.bilibili.com/' },
    });
  });

  it('retains absent fields as unavailable, while preserving real zero', async () => {
    const http: HttpClient = {
      request: async () => jsonResponse({ code: 0, data: { guard_info: { count: 0 } } }),
    };
    const result = await new BilibiliAudienceResolver(http).resolve('6');
    expect(result.metrics.map(({ value }) => value)).toEqual([null, 0, null, null, null]);
    expect(result.roomId).toBe('6');
  });

  it.each([
    null,
    '',
    ' ',
    false,
    -1,
    1.5,
    '12万人',
    'NaN',
    'Infinity',
    Number.MAX_SAFE_INTEGER + 1,
  ])('does not coerce invalid counts %s', async (value) => {
    const http: HttpClient = {
      request: async () => jsonResponse({ code: 0, data: { guard_info: { count: value } } }),
    };
    const result = await new BilibiliAudienceResolver(http).resolve('6');
    expect(result.metrics.find((metric) => metric.key === 'guards')?.value).toBeNull();
  });

  it('reports anti-bot and upstream errors without fabricated counts', async () => {
    const http: HttpClient = {
      request: async () => jsonResponse({ code: -352, message: '风控校验失败' }),
    };
    await expect(new BilibiliAudienceResolver(http).resolve('6')).rejects.toMatchObject({
      code: 'UPSTREAM',
      message: '风控校验失败',
      details: { code: -352 },
    });
  });

  it('falls back to basic room counts when the rich endpoint requires anti-bot verification', async () => {
    const requests: HttpRequest[] = [];
    const signal = new AbortController().signal;
    const http: HttpClient = {
      request: async (request) => {
        requests.push(request);
        if (request.url.includes('getInfoByRoom')) return jsonResponse({ code: -352 });
        if (request.url.includes('get_info')) {
          return jsonResponse({
            code: 0,
            data: { room_id: 21686237, online: 76543, attention: 12345 },
          });
        }
        throw new Error('unexpected request');
      },
    };
    const result = await new BilibiliAudienceResolver(http).resolve('6', signal);
    expect(result.roomId).toBe('21686237');
    expect(result.metrics.map(({ value }) => value)).toEqual([null, null, null, 12345, 76543]);
    expect(requests).toHaveLength(2);
    expect(requests.every((request) => request.signal === signal)).toBe(true);
  });

  it('does not invent follower counts from unsupported fields in basic room data', async () => {
    const http: HttpClient = {
      request: async (request) => {
        if (request.url.includes('get_info')) {
          return jsonResponse({ code: 0, data: { online: 77, follower_num: 99 } });
        }
        throw new Error('unavailable');
      },
    };
    const result = await new BilibiliAudienceResolver(http).resolve('6');
    expect(result.metrics.map(({ value }) => value)).toEqual([null, null, null, null, 77]);
  });

  it('reads verified rank totals using the canonical room and anchor ids, preserving the 9999+ cap', async () => {
    const requests: HttpRequest[] = [];
    const signal = new AbortController().signal;
    const http: HttpClient = {
      request: async (request) => {
        requests.push(request);
        if (request.url.includes('getInfoByRoom')) return jsonResponse({ code: -352 });
        if (request.url.includes('get_info')) {
          return jsonResponse({
            code: 0,
            data: { uid: 50329118, room_id: 7734200, attention: 17072696, online: 3670436 },
          });
        }
        if (request.url.includes('getOnlineGoldRank')) {
          return jsonResponse({
            code: 0,
            data: { onlineNum: 9999, onlineNumText: '9999+', OnlineRankItem: [{}] },
          });
        }
        if (request.url.includes('guardTab/topList')) {
          return jsonResponse({ code: 0, data: { info: { num: 0 }, list: [] } });
        }
        throw new Error('unexpected request');
      },
    };
    const result = await new BilibiliAudienceResolver(http).resolve('7734200', signal);
    expect(result.metrics[0]).toMatchObject({ key: 'highEnergy', value: 9999, isLowerBound: true });
    expect(result.metrics.find(({ key }) => key === 'guards')?.value).toBe(0);
    const rankQuery = new URL(
      requests.find((request) => request.url.includes('getOnlineGoldRank'))!.url,
    ).searchParams;
    expect(rankQuery.get('roomId')).toBe('7734200');
    expect(rankQuery.get('ruid')).toBe('50329118');
    expect(rankQuery.get('pageSize')).toBe('1');
    expect(requests.every((request) => request.signal === signal)).toBe(true);
  });

  it('keeps independent rank success when the other rank request fails', async () => {
    const http: HttpClient = {
      request: async (request) => {
        if (request.url.includes('getInfoByRoom')) {
          return jsonResponse({
            code: 0,
            data: { room_info: { room_id: 7734200, uid: 50329118 }, watched_show: { num: 777 } },
          });
        }
        if (request.url.includes('guardTab/topList'))
          return jsonResponse({ code: 0, data: { info: { num: '32' } } });
        throw new Error('online rank unavailable');
      },
    };
    const result = await new BilibiliAudienceResolver(http).resolve('7734200');
    expect(result.metrics.map(({ value }) => value)).toEqual([null, 32, 777, null, null]);
  });

  it('uses rank totals instead of the length of a single page', async () => {
    const http: HttpClient = {
      request: async (request) => {
        if (request.url.includes('getInfoByRoom')) {
          return jsonResponse({
            code: 0,
            data: { room_info: { room_id: 7734200, uid: 50329118 } },
          });
        }
        if (request.url.includes('getOnlineGoldRank')) {
          return jsonResponse({
            code: 0,
            data: { onlineNum: 231, onlineNumText: '231', OnlineRankItem: [{}] },
          });
        }
        return jsonResponse({ code: 0, data: { info: { num: 45 }, list: [{}] } });
      },
    };
    const result = await new BilibiliAudienceResolver(http).resolve('7734200');
    expect(result.metrics[0]).toMatchObject({ value: 231 });
    expect(result.metrics[0]?.isLowerBound).toBeUndefined();
    expect(result.metrics.find(({ key }) => key === 'guards')?.value).toBe(45);
  });

  it('does not start fallback requests after cancellation', async () => {
    const controller = new AbortController();
    let requestCount = 0;
    const http: HttpClient = {
      request: async () => {
        requestCount += 1;
        controller.abort();
        throw new Error('cancelled');
      },
    };
    await expect(
      new BilibiliAudienceResolver(http).resolve('6', controller.signal),
    ).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(requestCount).toBe(1);
  });

  it('propagates cancellation and network failures', async () => {
    const error = new Error('aborted');
    const http: HttpClient = {
      request: async () => {
        throw error;
      },
    };
    await expect(new BilibiliAudienceResolver(http).resolve('6')).rejects.toBe(error);
  });

  it('rejects an empty room without a request', async () => {
    const http: HttpClient = {
      request: async () => {
        throw new Error('must not request');
      },
    };
    await expect(new BilibiliAudienceResolver(http).resolve(' ')).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });
});
