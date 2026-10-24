import { describe, expect, it } from 'vitest';
import type { HttpClient, HttpRequest, HttpResponse } from '../../ports/HttpClient';
import { DouyuStreamResolver } from './DouyuStreamResolver';

function jsonResponse(data: unknown): HttpResponse {
  const text = JSON.stringify(data);
  const json = async <T>(): Promise<T> => data as T;
  return { status: 200, headers: {}, text: async () => text, json };
}

const encryption = {
  error: 0,
  data: {
    key: 'key',
    rand_str: 'rand',
    enc_time: 0,
    is_special: 0,
    enc_data: 'enc-data',
  },
};

describe('DouyuStreamResolver', () => {
  it('posts signed play parameters and returns an FLV url', async () => {
    const requests: HttpRequest[] = [];
    const http: HttpClient = {
      request: async (request) => {
        requests.push(request);
        if (request.url.includes('getEncryption')) return jsonResponse(encryption);
        return jsonResponse({
          error: 0,
          data: {
            rtmp_url: 'https://cdn.example/live',
            rtmp_live: 'room.flv',
            room_name: '测试直播间',
            nickname: '主播',
          },
        });
      },
    };

    const playback = await new DouyuStreamResolver(http).resolve('123', '4', false);

    expect(playback).toMatchObject({
      platform: 'douyu',
      roomId: '123',
      title: '测试直播间',
      anchorName: '主播',
      url: 'https://cdn.example/live/room.flv',
      format: 'flv',
      quality: '超清',
    });

    const playRequest = requests.find((request) => request.url.includes('getH5PlayV1'));
    expect(playRequest?.method).toBe('POST');
    const body = new URLSearchParams(playRequest?.body ?? '');
    expect(body.get('rate')).toBe('4');
    expect(body.get('enc_data')).toBe('enc-data');
    expect(body.get('auth')).toHaveLength(32);
  });

  it('uses HLS when requested and available', async () => {
    const http: HttpClient = {
      request: async (request) => {
        if (request.url.includes('getEncryption')) return jsonResponse(encryption);
        return jsonResponse({
          error: 0,
          data: {
            rtmp_url: 'https://cdn.example/live',
            rtmp_live: 'room.flv',
            hls_url: 'https://hls.example/live',
            hls_live: 'room.m3u8',
          },
        });
      },
    };

    const playback = await new DouyuStreamResolver(http).resolve('123', '0', true);

    expect(playback.format).toBe('hls');
    expect(playback.url).toBe('https://hls.example/live/room.m3u8');
  });

  it('maps upstream encryption failures to AppError', async () => {
    const http: HttpClient = {
      request: async () => jsonResponse({ error: 1, msg: '房间不存在' }),
    };

    await expect(new DouyuStreamResolver(http).resolve('404')).rejects.toMatchObject({
      code: 'UPSTREAM',
      message: '房间不存在',
    });
  });
});
