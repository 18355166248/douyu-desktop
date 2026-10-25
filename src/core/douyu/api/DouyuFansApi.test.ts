import { describe, expect, it, vi } from 'vitest';
import type { DouyuAuthContext } from '../auth/DouyuAuthContext';
import type { HttpClient, HttpRequest, HttpResponse } from '../../ports/HttpClient';
import { DouyuFansApi } from './DouyuFansApi';

function response(status: number, body: string): HttpResponse {
  return {
    status,
    headers: {},
    text: async () => body,
    json: async <T>() => JSON.parse(body) as T,
  };
}

function client(responses: HttpResponse[]): {
  http: HttpClient;
  requests: HttpRequest[];
} {
  const requests: HttpRequest[] = [];
  const queue = [...responses];
  return {
    requests,
    http: {
      request: async (request) => {
        requests.push(request);
        const next = queue.shift();
        if (!next) throw new Error('unexpected request');
        return next;
      },
    },
  };
}

function auth(fansCtn: (forceRefresh?: boolean) => Promise<string>): DouyuAuthContext {
  return {
    headers: async () => ({ token: 'token' }),
    csrfToken: async () => '',
    fansCtn,
  };
}

describe('DouyuFansApi', () => {
  it('signs a fan club with the ctn and room id', async () => {
    const { http, requests } = client([response(200, '{"error":0,"msg":"操作成功"}')]);
    const api = new DouyuFansApi(
      http,
      auth(async () => 'ctn-1'),
    );

    await expect(api.sign('138243')).resolves.toBe('signed');
    expect(requests[0]?.body).toBe('ctn=ctn-1&rid=138243');
    expect(requests[0]?.headers).toMatchObject({
      token: 'token',
      'Content-Type': 'application/x-www-form-urlencoded',
    });
  });

  it('treats an already signed room as success', async () => {
    const { http } = client([response(200, '{"error":-1,"msg":"今日已签到，请明天再来"}')]);
    const api = new DouyuFansApi(
      http,
      auth(async () => 'ctn-1'),
    );

    await expect(api.sign('138243')).resolves.toBe('already');
  });

  it('refreshes the ctn and retries once when csrf verification fails', async () => {
    const fansCtn = vi
      .fn<(forceRefresh?: boolean) => Promise<string>>()
      .mockResolvedValueOnce('old')
      .mockResolvedValueOnce('new');
    const { http, requests } = client([
      response(403, '{"message":"csrf auth failed"}'),
      response(200, '{"error":0,"msg":"操作成功"}'),
    ]);
    const api = new DouyuFansApi(http, auth(fansCtn));

    await expect(api.sign('138243')).resolves.toBe('signed');
    expect(requests).toHaveLength(2);
    expect(requests[0]?.body).toBe('ctn=old&rid=138243');
    expect(requests[1]?.body).toBe('ctn=new&rid=138243');
    expect(fansCtn).toHaveBeenNthCalledWith(1);
    expect(fansCtn).toHaveBeenNthCalledWith(2, true);
  });

  it('surfaces an expired login as an auth error', async () => {
    const { http } = client([response(200, '{"error":1,"msg":"请先登录"}')]);
    const api = new DouyuFansApi(
      http,
      auth(async () => 'ctn-1'),
    );

    await expect(api.sign('138243')).rejects.toMatchObject({ code: 'AUTH_EXPIRED' });
  });
});
