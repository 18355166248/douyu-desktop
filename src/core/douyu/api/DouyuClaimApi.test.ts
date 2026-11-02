import { describe, expect, it } from 'vitest';
import type { HttpClient, HttpRequest, HttpResponse } from '../../ports/HttpClient';
import type { DouyuAuthContext } from '../auth/DouyuAuthContext';
import {
  DouyuClaimApi,
  parseRedPacketGrab,
  parseRedPacketList,
  parseWatchPointsStatus,
} from './DouyuClaimApi';

const auth: DouyuAuthContext = {
  headers: async (kind) =>
    kind === 'android'
      ? { token: '9_1_2_3_4', aid: 'android1' }
      : { token: '9_1_2_3_4', Referer: 'https://www.douyu.com/' },
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

describe('parseWatchPointsStatus', () => {
  it('keeps only the finished, claimable tasks', () => {
    expect(
      parseWatchPointsStatus({
        data: {
          startTime: '1793000000',
          taskList: { a: { status: 2 }, b: { status: 1 }, c: { status: '2' } },
        },
      }),
    ).toEqual({ startTime: '1793000000', claimableIds: ['a', 'c'], taskCount: 3 });
  });

  it('reports how many tasks the activity still has', () => {
    expect(parseWatchPointsStatus({ data: { startTime: '', taskList: {} } })).toEqual({
      startTime: '',
      claimableIds: [],
      taskCount: 0,
    });
  });

  it('throws when the activity payload is missing', () => {
    expect(() => parseWatchPointsStatus({})).toThrowError();
  });
});

describe('parseRedPacketList', () => {
  it('normalises second and millisecond start times and skips empty ids', () => {
    expect(
      parseRedPacketList({
        data: {
          list: [
            { activityid: '11', startTime: '1793000000' },
            { activityid: 12, startTime: 1_793_000_000_000 },
            { activityid: '', startTime: '1793000000' },
            { startTime: '1793000000' },
          ],
        },
      }),
    ).toEqual([
      { activityId: '11', startTime: 1_793_000_000_000 },
      { activityId: '12', startTime: 1_793_000_000_000 },
    ]);
  });

  it('returns an empty list for unusable payloads', () => {
    expect(parseRedPacketList({})).toEqual([]);
    expect(parseRedPacketList({ data: { list: [] } })).toEqual([]);
  });
});

describe('parseRedPacketGrab', () => {
  it('maps isSuc=2 to retry', () => {
    expect(parseRedPacketGrab({ data: { isSuc: 2, msg: '继续抢' } }).status).toBe('retry');
  });

  it('reports the silver amount when the grab succeeds', () => {
    expect(parseRedPacketGrab({ data: { isSuc: 0, silver: 40 } })).toEqual({
      status: 'claimed',
      message: '40鱼丸',
    });
  });

  it('falls back to none when nothing was awarded', () => {
    expect(parseRedPacketGrab({ data: { isSuc: 0 } }).status).toBe('none');
    expect(parseRedPacketGrab({}).status).toBe('none');
  });
});

describe('DouyuClaimApi', () => {
  it('posts ctn and the activity alias when reading the watch-point status', async () => {
    const requests: HttpRequest[] = [];
    const http: HttpClient = {
      request: async (request) => {
        requests.push(request);
        return jsonResponse({ data: { startTime: '1', taskList: { t1: { status: 2 } } } });
      },
    };

    const status = await new DouyuClaimApi(http, auth).watchPointsStatus('10086000');

    expect(status.claimableIds).toEqual(['t1']);
    expect(requests[0]).toMatchObject({
      url: 'https://www.douyu.com/wgapi/activitync/gametask/viewStatus',
      method: 'POST',
      body: 'ctn=10086000&actAlias=20250521OPFOY',
    });
  });

  it('treats 31200 as already claimed instead of a failure', async () => {
    const http: HttpClient = {
      request: async () => jsonResponse({ error: 31200, msg: '已经领取过' }),
    };

    const result = await new DouyuClaimApi(http, auth).watchPointsTakeGift('1', 't1', '1793000000');

    expect(result).toEqual({ claimed: false, message: '已经领取过' });
  });

  it('requests the red-packet list for the room', async () => {
    const requests: HttpRequest[] = [];
    const http: HttpClient = {
      request: async (request) => {
        requests.push(request);
        return jsonResponse({ data: { list: [{ activityid: '7', startTime: '1793000000' }] } });
      },
    };

    const list = await new DouyuClaimApi(http, auth).redPacketList('9999');

    expect(list).toHaveLength(1);
    expect(requests[0]?.url).toBe(
      'https://www.douyu.com/japi/interactnc/web/propredpacket/getPrpList?type_id=1&room_id=9999',
    );
  });

  it('posts the activity id and ctn when grabbing a red packet', async () => {
    const requests: HttpRequest[] = [];
    const http: HttpClient = {
      request: async (request) => {
        requests.push(request);
        return jsonResponse({ data: { isSuc: 0, silver: 40 } });
      },
    };

    const result = await new DouyuClaimApi(http, auth).redPacketGrab('10086000', '7');

    expect(result).toEqual({ status: 'claimed', message: '40鱼丸' });
    expect(requests[0]).toMatchObject({
      url: 'https://www.douyu.com/japi/interactnc/web/propredpacket/grab_prp',
      method: 'POST',
      body: 'activityid=7&ctn=10086000',
    });
  });
});
