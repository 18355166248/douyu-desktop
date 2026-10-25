import { describe, expect, it } from 'vitest';
import type { HttpClient, HttpResponse } from '../../ports/HttpClient';
import { BilibiliDanmakuConfigResolver } from './BilibiliDanmakuConfigResolver';

function jsonResponse(data: unknown): HttpResponse {
  const text = JSON.stringify(data);
  const json = async <T>(): Promise<T> => data as T;
  return { status: 200, headers: {}, text: async () => text, json };
}

describe('BilibiliDanmakuConfigResolver', () => {
  it('returns the first websocket host and token', async () => {
    const http: HttpClient = {
      request: async () =>
        jsonResponse({
          code: 0,
          message: 'ok',
          data: {
            host: 'broadcastlv.chat.bilibili.com',
            token: 'token-1',
            host_server_list: [{ host: 'bd-bj-live-comet-13.chat.bilibili.com', wss_port: 443 }],
          },
        }),
    };

    await expect(new BilibiliDanmakuConfigResolver(http).resolve('6')).resolves.toEqual({
      host: 'bd-bj-live-comet-13.chat.bilibili.com',
      token: 'token-1',
    });
  });

  it('maps upstream failures to AppError', async () => {
    const http: HttpClient = {
      request: async () => jsonResponse({ code: -352, message: '-352' }),
    };

    await expect(new BilibiliDanmakuConfigResolver(http).resolve('6')).rejects.toMatchObject({
      code: 'UPSTREAM',
      message: '-352',
    });
  });
});
