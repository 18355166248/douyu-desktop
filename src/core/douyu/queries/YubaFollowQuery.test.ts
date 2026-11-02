import { describe, expect, it } from 'vitest';
import type { HttpClient, HttpRequest, HttpResponse } from '../../ports/HttpClient';
import type { DouyuAuthContext } from '../auth/DouyuAuthContext';
import { YubaFollowQuery } from './YubaFollowQuery';

const auth: DouyuAuthContext = {
  headers: async () => ({ 'dy-token': '9_1_2_3_4', 'dy-client': 'pc' }),
  csrfToken: async () => 'csrf',
  fansCtn: async () => '10086000',
};

function jsonResponse(data: unknown): HttpResponse {
  return {
    status: 200,
    headers: {},
    text: async () => JSON.stringify(data),
    json: async <T>() => data as T,
  };
}

describe('YubaFollowQuery', () => {
  it('walks every page, de-duplicates groups and sends the yuba token', async () => {
    const requests: HttpRequest[] = [];
    const pages: Record<string, unknown> = {
      '1': { data: { count_page: 2, list: [{ group_id: '1', group_name: '甲' }] } },
      '2': {
        data: {
          count_page: 2,
          list: [
            { group_id: 2, group_name: '乙' },
            { group_id: '1', group_name: '甲' },
            { group_id: '' },
          ],
        },
      },
    };
    const http: HttpClient = {
      request: async (request) => {
        requests.push(request);
        const page = /page=(\d+)/.exec(request.url)?.[1] ?? '1';
        return jsonResponse(pages[page]);
      },
    };

    const groups = await new YubaFollowQuery(http, auth).list();

    expect(groups).toEqual([
      { groupId: '1', name: '甲' },
      { groupId: '2', name: '乙' },
    ]);
    expect(requests.map((request) => request.url)).toEqual([
      'https://yuba.douyu.com/wbapi/web/group/myFollow?page=1&limit=30',
      'https://yuba.douyu.com/wbapi/web/group/myFollow?page=2&limit=30',
    ]);
    expect(requests[0]?.headers).toMatchObject({ 'dy-token': '9_1_2_3_4' });
  });

  it('stops at the first empty page even when more pages are advertised', async () => {
    const http: HttpClient = {
      request: async () => jsonResponse({ data: { count_page: 5, list: [] } }),
    };

    expect(await new YubaFollowQuery(http, auth).list()).toEqual([]);
  });

  it('falls back to a readable name for unnamed groups', async () => {
    const http: HttpClient = {
      request: async () => jsonResponse({ data: { count_page: 1, list: [{ group_id: '7' }] } }),
    };

    expect(await new YubaFollowQuery(http, auth).list()).toEqual([{ groupId: '7', name: '鱼吧 7' }]);
  });
});
