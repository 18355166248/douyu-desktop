import { describe, expect, it } from 'vitest';
import type { HttpClient, HttpRequest, HttpResponse } from '../../ports/HttpClient';
import { HuyaStreamResolver } from './HuyaStreamResolver';

function jsonResponse(data: unknown): HttpResponse {
  const text = JSON.stringify(data);
  return {
    status: 200,
    headers: {},
    text: async () => text,
    json: async <T>() => data as T,
  };
}

function textResponse(status: number, body: string): HttpResponse {
  return {
    status,
    headers: {},
    text: async () => body,
    json: async () => {
      throw new Error('not json');
    },
  };
}

function profile(multiLine: Array<{ url: string; cdnType: string; webPriorityRate: number }>) {
  return {
    status: 200,
    data: {
      liveStatus: 'ON',
      liveData: {
        nick: '测试主播',
        roomName: '测试直播间',
        profileRoom: 11342412,
      },
      profileInfo: { nick: '备用昵称' },
      stream: {
        hls: {
          multiLine,
          rateArray: [
            { sDisplayName: '蓝光6M', iBitRate: 6000, iCodecType: 0 },
            { sDisplayName: '超清', iBitRate: 2000, iCodecType: 0 },
          ],
        },
      },
    },
  };
}

function baseProfile(baseSteamInfoList: Record<string, unknown>) {
  return {
    status: 200,
    data: {
      liveStatus: 'ON',
      liveData: {
        nick: '测试主播',
        roomName: '测试直播间',
        profileRoom: 11342412,
      },
      stream: {
        baseSteamInfoList,
        hls: {
          rateArray: [{ sDisplayName: '超清', iBitRate: 2000, iCodecType: 0 }],
        },
      },
    },
  };
}

const TX = 'http://tx.hls.huya.com/src/live.m3u8?ratio=2000&wsTime=6aded69c';
const HS = 'http://hs.hls.huya.com/src/live.m3u8?ratio=2000&wsTime=6aded69c';

function fakeHttp(
  handlers: Record<'profile' | 'hs' | 'tx', HttpResponse | (() => HttpResponse)>,
): HttpClient {
  const resolve = (value: HttpResponse | (() => HttpResponse)): HttpResponse =>
    typeof value === 'function' ? value() : value;
  return {
    request: async (request: HttpRequest) => {
      if (request.url.includes('profileRoom')) return resolve(handlers.profile);
      if (request.url.startsWith('https://hs.hls.huya.com')) return resolve(handlers.hs);
      if (request.url.startsWith('https://tx.hls.huya.com')) return resolve(handlers.tx);
      throw new Error(`unexpected request: ${request.url}`);
    },
  };
}

describe('HuyaStreamResolver', () => {
  it('prefers the working Huya HS HLS line and builds metadata', async () => {
    const http = fakeHttp({
      profile: jsonResponse(
        profile([
          { url: TX, cdnType: 'TX', webPriorityRate: 60 },
          { url: HS, cdnType: 'HS', webPriorityRate: 40 },
        ]),
      ),
      hs: textResponse(200, '#EXTM3U\n#EXT-X-VERSION:3'),
      tx: textResponse(403, ''),
    });

    const playback = await new HuyaStreamResolver(http).resolve('11342412');

    expect(playback).toMatchObject({
      platform: 'huya',
      roomId: '11342412',
      title: '测试直播间',
      anchorName: '测试主播',
      url: 'https://hs.hls.huya.com/src/live.m3u8?ratio=2000&wsTime=6aded69c',
      format: 'hls',
      quality: '超清',
    });
    expect(playback.expiresAt).toBe((Number.parseInt('6aded69c', 16) + 3600) * 1000);
  });

  it('builds HLS candidates from baseStreamInfo antiCode', async () => {
    const http = fakeHttp({
      profile: jsonResponse(
        baseProfile({
          al: {
            sCdnType: 'AL',
            sStreamName: 'stream-al',
            sHlsUrl: 'http://al.hls.huya.com/src',
            sHlsAntiCode: 'wsSecret=aaa&wsTime=6aded69c',
            iWebPriorityRate: 8,
          },
          hs: {
            sCdnType: 'HS',
            sStreamName: 'stream-hs',
            sHlsUrl: 'http://hs.hls.huya.com/src',
            sHlsAntiCode: 'wsSecret=bbb&wsTime=6aded69c',
            iWebPriorityRate: 18,
          },
          hs24: {
            sCdnType: 'HS24',
            sStreamName: 'stream-hs24',
            sHlsUrl: 'http://hs.hls.huya.com/src',
            sHlsAntiCode: 'wsSecret=ccc&wsTime=6aded69c',
            iWebPriorityRate: 25,
          },
        }),
      ),
      hs: textResponse(200, ''),
      tx: textResponse(403, ''),
    });

    const { playback, urls } = await new HuyaStreamResolver(http).resolveCandidates('11342412');

    expect(urls[0]).toBe(
      'https://hs.hls.huya.com/src/stream-hs24.m3u8?ratio=2000&wsSecret=ccc&wsTime=6aded69c',
    );
    expect(urls).toHaveLength(3);
    expect(playback.url).toBe(urls[0]);
  });

  it('falls back to TX when there is no HS line', async () => {
    const http = fakeHttp({
      profile: jsonResponse(profile([{ url: TX, cdnType: 'TX', webPriorityRate: 60 }])),
      hs: textResponse(403, ''),
      tx: textResponse(200, '#EXTM3U\n#EXT-X-VERSION:3'),
    });

    const playback = await new HuyaStreamResolver(http).resolve('11342412');
    expect(playback.url).toContain('https://tx.hls.huya.com');
  });

  it('rejects offline rooms', async () => {
    const http = fakeHttp({
      profile: {
        status: 200,
        headers: {},
        text: async () => '',
        json: async <T>() => ({ status: 200, data: { liveStatus: 'OFF' } }) as T,
      },
      hs: textResponse(403, ''),
      tx: textResponse(403, ''),
    });

    await expect(new HuyaStreamResolver(http).resolve('11342412')).rejects.toThrow('主播未开播');
  });

  it('reports when no HLS line is returned', async () => {
    const http = fakeHttp({
      profile: jsonResponse(profile([])),
      hs: textResponse(403, ''),
      tx: textResponse(403, ''),
    });

    await expect(new HuyaStreamResolver(http).resolve('11342412')).rejects.toThrow(
      '虎牙没有返回可用的 HLS 线路',
    );
  });
});
