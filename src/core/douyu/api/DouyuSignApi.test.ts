import { describe, expect, it } from 'vitest';
import { AppError } from '../../errors';
import type { HttpClient, HttpRequest, HttpResponse } from '../../ports/HttpClient';
import type { DouyuAuthContext } from '../auth/DouyuAuthContext';
import {
  DouyuSignApi,
  parseClientSign,
  parseYubaSign,
  parseYubaSupplementCards,
} from './DouyuSignApi';

const auth: DouyuAuthContext = {
  headers: async (kind) => {
    if (kind === 'yuba') return { 'dy-token': '9_1_2_3_4', 'dy-client': 'pc' };
    if (kind === 'android') return { token: '9_1_2_3_4', aid: 'android1' };
    return { token: '9_1_2_3_4', Referer: 'https://www.douyu.com/' };
  },
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

describe('parseClientSign', () => {
  it('collects the rewarded items', () => {
    expect(
      parseClientSign({ data: { sign_pl: [{ name: '鱼丸', cnt: 10 }, { name: '荧光棒', cnt: '2' }] } }),
    ).toEqual({ status: 'signed', items: ['10个鱼丸', '2个荧光棒'] });
  });

  it('treats an empty payload as already signed', () => {
    expect(parseClientSign({ data: [] })).toEqual({ status: 'already', items: [] });
    expect(parseClientSign({ data: null })).toEqual({ status: 'already', items: [] });
    expect(parseClientSign({})).toEqual({ status: 'already', items: [] });
  });

  it('drops unusable reward entries', () => {
    expect(
      parseClientSign({ data: { sign_pl: [{ name: '', cnt: 1 }, { name: '鱼丸', cnt: 0 }] } }),
    ).toEqual({ status: 'already', items: [] });
  });
});

describe('parseYubaSign', () => {
  it('reads the experience and the streak on success', () => {
    expect(parseYubaSign('', { data: { count: 5, exp: '12' } })).toEqual({
      status: 'signed',
      exp: 12,
      continuousDays: 5,
    });
  });

  it('maps 已签到 to already signed', () => {
    expect(parseYubaSign('已签到', {})).toEqual({
      status: 'already',
      exp: null,
      continuousDays: null,
    });
  });

  it('throws a retryable upstream error for 签到失败', () => {
    expect(() => parseYubaSign('签到失败', {})).toThrowError(AppError);
    try {
      parseYubaSign('签到失败', {});
    } catch (error) {
      expect((error as AppError).code).toBe('UPSTREAM');
    }
  });
});

describe('parseYubaSupplementCards', () => {
  it('reads the remaining supplement cards', () => {
    expect(parseYubaSupplementCards({ data: { supplementary_cards: 2 } })).toBe(2);
    expect(parseYubaSupplementCards({ data: {} })).toBe(0);
  });
});

describe('DouyuSignApi', () => {
  it('sends the android token to the client sign endpoint', async () => {
    const requests: HttpRequest[] = [];
    const http: HttpClient = {
      request: async (request) => {
        requests.push(request);
        return jsonResponse({ data: { sign_pl: [{ name: '鱼丸', cnt: 10 }] } });
      },
    };

    const result = await new DouyuSignApi(http, auth).clientSign();

    expect(result).toEqual({ status: 'signed', items: ['10个鱼丸'] });
    expect(requests[0]).toMatchObject({
      url: 'https://apiv2.douyucdn.cn/h5nc/sign/sendSign',
      method: 'POST',
      body: 'token=9_1_2_3_4',
      retry: 'safe',
    });
    expect(requests[0]?.headers).toMatchObject({ token: '9_1_2_3_4', aid: 'android1' });
  });

  it('posts the group id and a group referer to the yuba sign endpoint', async () => {
    const requests: HttpRequest[] = [];
    const http: HttpClient = {
      request: async (request) => {
        requests.push(request);
        return jsonResponse({ message: '', data: { count: 3, exp: 8 } });
      },
    };

    const result = await new DouyuSignApi(http, auth).yubaSign('123456');

    expect(result).toEqual({ status: 'signed', exp: 8, continuousDays: 3 });
    expect(requests[0]).toMatchObject({
      url: 'https://yuba.douyu.com/ybapi/topic/sign',
      method: 'POST',
      body: 'group_id=123456',
    });
    expect(requests[0]?.headers).toMatchObject({
      'dy-token': '9_1_2_3_4',
      Referer: 'https://yuba.douyu.com/group/123456',
    });
  });

  it('maps the diamond-fans reply codes', async () => {
    const replies = [
      { payload: { error: 0 }, expected: 1 },
      { payload: { error: 1, msg: '今日已签到' }, expected: 0 },
    ];
    for (const reply of replies) {
      const http: HttpClient = { request: async () => jsonResponse(reply.payload) };
      const result = await new DouyuSignApi(http, auth).diamondFansSign('9999', '10086000');
      expect(result.signed).toBe(reply.expected);
    }

    const failing: HttpClient = {
      request: async () => jsonResponse({ error: 1, msg: '系统繁忙' }),
    };
    await expect(
      new DouyuSignApi(failing, auth).diamondFansSign('9999', '10086000'),
    ).rejects.toThrowError('系统繁忙');
  });

  it('surfaces an expired login instead of a generic failure', async () => {
    const http: HttpClient = {
      request: async () => jsonResponse({ error: 101, msg: '请先登录' }),
    };
    await expect(
      new DouyuSignApi(http, auth).diamondFansSign('9999', '10086000'),
    ).rejects.toMatchObject({ code: 'AUTH_EXPIRED' });
  });
});
