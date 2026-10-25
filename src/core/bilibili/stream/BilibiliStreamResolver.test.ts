import { describe, expect, it } from 'vitest';
import type { HttpClient, HttpRequest, HttpResponse } from '../../ports/HttpClient';
import { BilibiliStreamResolver } from './BilibiliStreamResolver';

function jsonResponse(data: unknown): HttpResponse {
  const text = JSON.stringify(data);
  const json = async <T>(): Promise<T> => data as T;
  return { status: 200, headers: {}, text: async () => text, json };
}

const roomInit = {
  code: 0,
  message: 'ok',
  data: { room_id: 7734200, short_id: 6, live_status: 1 },
};

const roomInfo = {
  code: 0,
  message: 'ok',
  data: { title: '测试直播间', uid: 1, live_status: 1 },
};

const anchor = {
  code: 0,
  message: 'ok',
  data: { info: { uname: '测试主播' } },
};

function playInfo(protocol: 'http_stream' | 'http_hls'): unknown {
  const hls = protocol === 'http_hls';
  return {
    code: 0,
    message: 'ok',
    data: {
      room_id: 7734200,
      live_status: 1,
      playurl_info: {
        playurl: {
          stream: [
            {
              protocol_name: protocol,
              format: [
                {
                  format_name: hls ? 'ts' : 'flv',
                  codec: [
                    {
                      codec_name: 'avc',
                      base_url: hls ? '/live.m3u8?' : '/live.flv?',
                      current_qn: 250,
                      url_info: [
                        {
                          host: hls ? 'https://hls.example' : 'https://cdn.example',
                          extra: 'expires=1792893744&qn=250',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    },
  };
}

function fakeHttp(protocol: 'http_stream' | 'http_hls'): HttpClient {
  return {
    request: async (request: HttpRequest) => {
      if (request.url.includes('room_init')) return jsonResponse(roomInit);
      if (request.url.includes('get_info')) return jsonResponse(roomInfo);
      if (request.url.includes('get_anchor_in_room')) return jsonResponse(anchor);
      if (request.url.includes('getRoomPlayInfo')) return jsonResponse(playInfo(protocol));
      throw new Error(`unexpected request: ${request.url}`);
    },
  };
}

describe('BilibiliStreamResolver', () => {
  it('returns an FLV url and real room metadata by default', async () => {
    const playback = await new BilibiliStreamResolver(fakeHttp('http_stream')).resolve('6');

    expect(playback).toMatchObject({
      platform: 'bilibili',
      roomId: '7734200',
      title: '测试直播间',
      anchorName: '测试主播',
      url: 'https://cdn.example/live.flv?expires=1792893744&qn=250',
      format: 'flv',
      quality: '超清',
    });
    expect(playback.expiresAt).toBe(1792893744000);
  });

  it('uses HLS when requested and available', async () => {
    const playback = await new BilibiliStreamResolver(fakeHttp('http_hls')).resolve('6', '10000', true);

    expect(playback.format).toBe('hls');
    expect(playback.url).toBe('https://hls.example/live.m3u8?expires=1792893744&qn=250');
  });

  it('rejects a room that is not live', async () => {
    const http: HttpClient = {
      request: async (request) => {
        if (request.url.includes('room_init')) {
          return jsonResponse({ ...roomInit, data: { ...roomInit.data, live_status: 0 } });
        }
        throw new Error('should not fetch play info');
      },
    };

    await expect(new BilibiliStreamResolver(http).resolve('6')).rejects.toMatchObject({
      code: 'UPSTREAM',
      message: '主播未开播',
    });
  });

  it('maps upstream errors to AppError', async () => {
    const http: HttpClient = {
      request: async () => jsonResponse({ code: 19002003, message: '房间不存在' }),
    };

    await expect(new BilibiliStreamResolver(http).resolve('404')).rejects.toMatchObject({
      code: 'UPSTREAM',
      message: '房间不存在',
    });
  });
});
