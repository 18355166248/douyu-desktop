import { describe, expect, it } from 'vitest';
import type { HttpClient, HttpRequest, HttpResponse } from '../../ports/HttpClient';
import { AppError } from '../../errors';
import { DouyuSearchQuery } from './DouyuSearchQuery';

function response(payload: unknown): HttpResponse {
  const body = JSON.stringify(payload);
  return {
    status: 200,
    headers: {},
    text: async () => body,
    json: async <T>() => payload as T,
  };
}

type Route = () => HttpResponse;

function client(routes: { searchUser?: Route; searchShow?: Route }): {
  http: HttpClient;
  requests: HttpRequest[];
} {
  const requests: HttpRequest[] = [];
  return {
    requests,
    http: {
      request: async (request) => {
        requests.push(request);
        const route = request.url.includes('/searchUser') ? routes.searchUser : routes.searchShow;
        if (!route) throw new AppError('NETWORK', 'unexpected request', { retryable: true });
        return route();
      },
    },
  };
}

const ANCHOR_PAGE = {
  error: 0,
  data: {
    relateUser: [
      {
        anchorInfo: {
          rid: 99999,
          nickName: '旭旭宝宝',
          cateName: 'DNF',
          isLive: 2,
          fansNumStr: '1899.9万',
          roomSrc: '//rpic.douyucdn.cn/anchor.avif',
        },
      },
      // 没有房间号的主播结果无法打开，应被丢弃。
      { anchorInfo: { rid: 0, nickName: '无房间主播' } },
      // 主播搜索不返回 roomName，标题只能回退成昵称。
      { anchorInfo: { rid: 138243, nickName: '洞主', isLive: 1, isLoop: 1 } },
    ],
  },
};

const SHOW_PAGE = {
  error: 0,
  data: {
    relateShow: [
      {
        rid: 138243,
        nickName: '洞主',
        roomName: '洞主的直播间',
        isLive: 1,
        hot: '150.7万',
        roomSrc: 'https://rpic.douyucdn.cn/live-cover/138243.png',
      },
      {
        rid: 9804176,
        nickName: '斗地主精选',
        roomName: '旭旭宝宝斗地主专场',
        isLive: 1,
        hot: '2348',
        videoLoop: 1,
      },
    ],
  },
};

function failing(message = '搜索失败'): Route {
  return () => {
    throw new AppError('NETWORK', message, { retryable: true });
  };
}

describe('DouyuSearchQuery', () => {
  it('merges anchor results first, dedupes by room id and keeps upstream order', async () => {
    const { http, requests } = client({
      searchUser: () => response(ANCHOR_PAGE),
      searchShow: () => response(SHOW_PAGE),
    });

    const items = await new DouyuSearchQuery(http).search('  旭旭宝宝  ');

    expect(requests.map((request) => request.url)).toEqual([
      expect.stringMatching(/\/searchUser\?kw=.*&page=1&pageSize=10$/),
      expect.stringMatching(/\/searchShow\?kw=.*&page=1&pageSize=10$/),
    ]);
    expect(requests[0]?.url).toContain('kw=%E6%97%AD%E6%97%AD%E5%AE%9D%E5%AE%9D');
    expect(items.map((item) => item.roomId)).toEqual(['99999', '138243', '9804176']);
    expect(items[0]).toMatchObject({
      platform: 'douyu',
      name: '旭旭宝宝',
      // 主播接口没有直播间标题，回退为昵称。
      title: '旭旭宝宝',
      isLive: false,
      match: 'anchor',
      category: 'DNF',
      fansText: '1899.9万',
      cover: 'https://rpic.douyucdn.cn/anchor.avif',
    });
    // 138243 在主播结果里已经出现，用直播间结果补全标题、封面和热度，不重复展示。
    expect(items[1]).toMatchObject({
      roomId: '138243',
      match: 'anchor',
      name: '洞主',
      title: '洞主的直播间',
      isLive: true,
      hasVideo: true,
      heat: 1_507_000,
      cover: 'https://rpic.douyucdn.cn/live-cover/138243.png',
    });
  });

  it('keeps room hits when the anchor search fails', async () => {
    const { http } = client({
      searchUser: failing('主播搜索失败'),
      searchShow: () => response(SHOW_PAGE),
    });

    const items = await new DouyuSearchQuery(http).search('洞主');
    expect(items.map((item) => item.roomId)).toEqual(['138243', '9804176']);
    expect(items[0]).toMatchObject({ match: 'room', heat: 1_507_000, hasVideo: false });
    expect(items[1]).toMatchObject({ hasVideo: true, heat: 2348 });
  });

  it('keeps anchor hits when the room search fails', async () => {
    const { http } = client({
      searchUser: () => response(ANCHOR_PAGE),
      searchShow: failing('直播间搜索失败'),
    });

    const items = await new DouyuSearchQuery(http).search('洞主');
    expect(items.map((item) => item.roomId)).toEqual(['99999', '138243']);
  });

  it('reports the upstream error when both searches fail', async () => {
    const { http } = client({ searchUser: failing(), searchShow: failing() });

    await expect(new DouyuSearchQuery(http).search('洞主')).rejects.toMatchObject({
      code: 'NETWORK',
    });
  });

  it('surfaces a non-zero error code instead of returning an empty list', async () => {
    const { http } = client({
      searchUser: () => response({ error: 100, msg: '参数错误' }),
      searchShow: () => response({ error: 100, msg: '参数错误' }),
    });

    await expect(new DouyuSearchQuery(http).search('洞主')).rejects.toMatchObject({
      code: 'UPSTREAM',
      message: '参数错误',
    });
  });

  it('does not touch the network for a blank keyword and honors the result limit', async () => {
    const { http, requests } = client({
      searchUser: () => response(ANCHOR_PAGE),
      searchShow: () => response(SHOW_PAGE),
    });
    await expect(new DouyuSearchQuery(http).search('   ')).resolves.toEqual([]);
    expect(requests).toHaveLength(0);

    const limited = await new DouyuSearchQuery(http).search('洞主', { limit: 1 });
    expect(limited.map((item) => item.roomId)).toEqual(['99999']);
  });
});
