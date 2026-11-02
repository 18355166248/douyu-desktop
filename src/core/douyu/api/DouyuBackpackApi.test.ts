import { describe, expect, it } from 'vitest';
import type { HttpClient, HttpRequest, HttpResponse } from '../../ports/HttpClient';
import type { DouyuAuthContext } from '../auth/DouyuAuthContext';
import { DouyuBackpackApi, parseBackpack } from './DouyuBackpackApi';

const auth: DouyuAuthContext = {
  headers: async () => ({ token: '9_1_2_3_4', Referer: 'https://www.douyu.com/' }),
  csrfToken: async () => 'csrf',
  fansCtn: async () => '10086000',
};

function jsonResponse(data: unknown, status = 200): HttpResponse {
  return {
    status,
    headers: {},
    text: async () => JSON.stringify(data),
    json: async <T>() => data as T,
  };
}

describe('parseBackpack', () => {
  it('keeps usable gifts and totals units, value and intimacy', () => {
    const summary = parseBackpack({
      data: {
        list: [
          {
            id: 268,
            name: '荧光棒',
            count: '25',
            price: '10',
            intimate: '2',
            isValuable: '1',
            batchInfo: {},
          },
          { id: '2358', name: '弱鸡', count: 5, price: 300, intimate: 1, isValuable: '1', batchInfo: { a: 1 } },
          { id: 9999, name: '空礼物', count: 0 },
          { name: '无 id' },
        ],
      },
    });

    expect(summary.gifts).toHaveLength(2);
    expect(summary.units).toBe(30);
    // 荧光棒 10 分 × 25 + 弱鸡 300 分 × 5 = 1750 分 = 17.5 元
    expect(summary.valueYuan).toBe(17.5);
    expect(summary.intimate).toBe(55);
    expect(summary.gifts[0]).toMatchObject({ propId: '268', batchable: false, valuable: true });
    expect(summary.gifts[1]).toMatchObject({ propId: '2358', batchable: true });
  });

  it('returns an empty summary for unusable payloads', () => {
    expect(parseBackpack({})).toEqual({ gifts: [], units: 0, valueYuan: 0, intimate: 0 });
  });

  it('does not count valueless gifts towards the price', () => {
    const summary = parseBackpack({
      data: { list: [{ id: 1, count: 2, price: 500, intimate: 3, isValuable: '0' }] },
    });
    expect(summary.valueYuan).toBe(0);
    expect(summary.intimate).toBe(6);
  });
});

describe('DouyuBackpackApi', () => {
  it('reads the backpack for the given room', async () => {
    const requests: HttpRequest[] = [];
    const http: HttpClient = {
      request: async (request) => {
        requests.push(request);
        return jsonResponse({ data: { list: [{ id: 268, count: 3 }] } });
      },
    };

    const summary = await new DouyuBackpackApi(http, auth).list('9999');

    expect(summary.units).toBe(3);
    expect(requests[0]?.url).toBe('https://www.douyu.com/japi/prop/backpack/web/v5?rid=9999');
    expect(requests[0]?.headers).toMatchObject({ Referer: 'https://www.douyu.com/9999' });
  });

  it('posts the donate form with the encoded bizExt', async () => {
    const requests: HttpRequest[] = [];
    const http: HttpClient = {
      request: async (request) => {
        requests.push(request);
        return jsonResponse({ error: 0, msg: 'success' });
      },
    };

    const result = await new DouyuBackpackApi(http, auth).donate('9999', '268', 25);

    expect(result).toEqual({ ok: true, message: 'success' });
    expect(requests[0]).toMatchObject({
      url: 'https://www.douyu.com/japi/prop/donate/mainsite/v1',
      method: 'POST',
      body: 'propId=268&propCount=25&roomId=9999&bizExt=%7B%22yzxq%22%3A%7B%7D%7D',
    });
    expect(requests[0]?.headers).toMatchObject({
      'Content-Type': 'application/x-www-form-urlencoded',
    });
  });

  it('treats a non-success message as a failed send', async () => {
    const http: HttpClient = {
      request: async () => jsonResponse({ error: 0, msg: '礼物数量不足' }),
    };

    await expect(
      new DouyuBackpackApi(http, auth).donate('9999', '268', 999),
    ).resolves.toEqual({ ok: false, message: '礼物数量不足' });
  });

  it('surfaces an expired login', async () => {
    const http: HttpClient = {
      request: async () => jsonResponse({ error: 1, msg: '请先登录' }),
    };

    await expect(new DouyuBackpackApi(http, auth).donate('9999', '268', 1)).rejects.toMatchObject({
      code: 'AUTH_EXPIRED',
    });
  });
});
