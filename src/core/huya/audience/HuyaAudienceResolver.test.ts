import { describe, expect, it } from 'vitest';
import type { HttpClient, HttpRequest, HttpResponse } from '../../ports/HttpClient';
import { HuyaAudienceResolver } from './HuyaAudienceResolver';

function jsonResponse(data: unknown): HttpResponse {
  return {
    status: 200,
    headers: {},
    text: async () => JSON.stringify(data),
    json: async <T>() => data as T,
  };
}

describe('HuyaAudienceResolver', () => {
  it('resolves aliases and labels totalCount as popularity, never as viewers', async () => {
    const requests: HttpRequest[] = [];
    const signal = new AbortController().signal;
    const http: HttpClient = {
      request: async (request) => {
        requests.push(request);
        return jsonResponse({
          status: '200',
          data: { liveData: { profileRoom: 660000, totalCount: '1234567' } },
        });
      },
    };

    const result = await new HuyaAudienceResolver(http).resolve(' lpl ', signal);
    expect(result).toMatchObject({ platform: 'huya', roomId: '660000' });
    expect(result.metrics).toContainEqual({
      key: 'popularity',
      label: '人气',
      value: 1234567,
      unit: '热度',
      description: expect.any(String),
    });
    expect(result.metrics.find((metric) => metric.key === 'vip')?.value).toBeNull();
    expect(requests[0]).toMatchObject({
      signal,
      timeoutMs: 8000,
      retry: 'safe',
      headers: { Referer: 'https://www.huya.com/' },
    });
    expect(new URL(requests[0]!.url).searchParams.get('roomid')).toBe('lpl');
  });

  it.each([undefined, null, '', ' ', false, -1, 1.5, '1万', 'NaN', 'Infinity'])(
    'does not turn invalid popularity %s into a count',
    async (value) => {
      const http: HttpClient = {
        request: async () =>
          jsonResponse({ status: 200, data: { liveData: { totalCount: value } } }),
      };
      const result = await new HuyaAudienceResolver(http).resolve('1');
      expect(result.metrics.find((metric) => metric.key === 'popularity')?.value).toBeNull();
    },
  );

  it('keeps a real zero from an offline room', async () => {
    const http: HttpClient = {
      request: async () => jsonResponse({ status: 200, data: { liveData: { totalCount: 0 } } }),
    };
    const result = await new HuyaAudienceResolver(http).resolve('1');
    expect(result.metrics.find((metric) => metric.key === 'popularity')?.value).toBe(0);
  });

  it('reads subscriptions independently from popularity and prefers the profile count', async () => {
    const http: HttpClient = {
      request: async () =>
        jsonResponse({
          status: 200,
          data: {
            profileInfo: { activityCount: 17841279 },
            liveData: { activityCount: 17841270, totalCount: 2889176 },
          },
        }),
    };
    const result = await new HuyaAudienceResolver(http).resolve('660000');
    expect(result.metrics.find((metric) => metric.key === 'subscribers')).toMatchObject({
      label: '订阅',
      value: 17841279,
      unit: '人',
    });
    expect(result.metrics.find((metric) => metric.key === 'popularity')?.value).toBe(2889176);
  });

  it('falls back to liveData subscriptions and does not replace a profile zero', async () => {
    let profileCount: unknown = undefined;
    const http: HttpClient = {
      request: async () =>
        jsonResponse({
          status: 200,
          data: {
            profileInfo: { activityCount: profileCount },
            liveData: { activityCount: '1234' },
          },
        }),
    };
    const resolver = new HuyaAudienceResolver(http);
    expect(
      (await resolver.resolve('660000')).metrics.find((metric) => metric.key === 'subscribers')
        ?.value,
    ).toBe(1234);
    profileCount = 0;
    expect(
      (await resolver.resolve('660000')).metrics.find((metric) => metric.key === 'subscribers')
        ?.value,
    ).toBe(0);
  });

  it('reports platform errors rather than inventing empty-room numbers', async () => {
    const http: HttpClient = {
      request: async () => jsonResponse({ status: 404, message: '房间不存在' }),
    };
    await expect(new HuyaAudienceResolver(http).resolve('1')).rejects.toMatchObject({
      code: 'UPSTREAM',
      message: '房间不存在',
    });
  });

  it('rejects an empty room without a request', async () => {
    const http: HttpClient = {
      request: async () => {
        throw new Error('must not request');
      },
    };
    await expect(new HuyaAudienceResolver(http).resolve(' ')).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });
});
