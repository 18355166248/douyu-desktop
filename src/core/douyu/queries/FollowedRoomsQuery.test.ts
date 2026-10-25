import { describe, expect, it } from 'vitest';
import type { HttpClient, HttpRequest, HttpResponse } from '../../ports/HttpClient';
import { FollowedRoomsQuery } from './FollowedRoomsQuery';

function response(payload: unknown): HttpResponse {
  const body = JSON.stringify(payload);
  return {
    status: 200,
    headers: {},
    text: async () => body,
    json: async <T>() => payload as T,
  };
}

function client(responses: HttpResponse[]): { http: HttpClient; requests: HttpRequest[] } {
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

const PAGE = {
  error: 0,
  data: {
    pageCount: 2,
    list: [
      {
        room_id: 138243,
        room_name: '洞主的直播间',
        nickname: '洞主',
        show_status: '1',
        is_special: 1,
        online: '269.5万',
        rs16_avif: 'https://rpic.douyucdn.cn/cover/138243.avif',
      },
      {
        room_id: '9999',
        room_name: '',
        nickname: '主播乙',
        show_status: 0,
        is_special: 0,
        online: '9800',
        hasvid: 1,
        vurl: 'https://v.douyu.com/show/abc',
      },
      { room_id: 138243, room_name: '重复', nickname: '重复主播', show_status: '1' },
    ],
  },
};

describe('FollowedRoomsQuery', () => {
  it('collects a follows page with anchor, title and live state', async () => {
    const { http, requests } = client([response(PAGE)]);
    const rooms = await new FollowedRoomsQuery(http).list({ maxPages: 1 });

    expect(rooms).toEqual([
      {
        platform: 'douyu',
        roomId: '138243',
        name: '洞主',
        title: '洞主的直播间',
        isLive: true,
        isSpecial: true,
        hasVideo: false,
        heat: 2_695_000,
        cover: 'https://rpic.douyucdn.cn/cover/138243.avif',
      },
      {
        platform: 'douyu',
        roomId: '9999',
        name: '主播乙',
        title: '主播乙',
        isLive: false,
        isSpecial: false,
        hasVideo: true,
        heat: 9800,
      },
    ]);
    expect(requests[0]?.url).toContain('follow/list?page=1');
  });

  it('stops at maxPages while honoring the requested cap', async () => {
    const { http, requests } = client([
      response({ ...PAGE, data: { ...PAGE.data, pageCount: 8 } }),
      response({ ...PAGE, data: { ...PAGE.data, list: [] } }),
    ]);
    await new FollowedRoomsQuery(http).list({ maxPages: 2 });
    expect(requests).toHaveLength(2);
  });

  it('reports an expired login instead of an empty list', async () => {
    const { http } = client([response({ error: 100, msg: '请先登录' })]);
    await expect(new FollowedRoomsQuery(http).list()).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
  });

  it('falls back to room_src and upgrades protocol-relative covers', async () => {
    const { http } = client([
      response({
        error: 0,
        data: {
          pageCount: 1,
          list: [
            {
              room_id: 7,
              room_name: '封面房间',
              nickname: '封面主播',
              show_status: 0,
              online: '1.2亿',
              room_src: '//rpic.douyucdn.cn/cover.png',
            },
          ],
        },
      }),
    ]);
    const rooms = await new FollowedRoomsQuery(http).list({ maxPages: 1 });
    expect(rooms[0]).toMatchObject({
      cover: 'https://rpic.douyucdn.cn/cover.png',
      heat: 120_000_000,
    });
  });
});
