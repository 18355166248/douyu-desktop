import type { Session } from 'electron';
import { describe, expect, it } from 'vitest';
import { DouyuAuthService } from './DouyuAuthService';

function fakeSession(
  cookies: Array<{ name: string; value: string; domain?: string }>,
  payload: unknown,
  urls: string[],
): Session {
  return {
    cookies: {
      get: async () => cookies,
    },
    fetch: async (url: string) => {
      urls.push(url);
      return {
        status: 200,
        json: async () => payload,
      };
    },
  } as unknown as Session;
}

const AUTH_COOKIES = [
  { name: 'acf_uid', value: '6050416', domain: '.douyu.com' },
  { name: 'acf_stk', value: 'stk', domain: '.douyu.com' },
  { name: 'acf_nickname', value: '%E5%B0%8F%E6%96%97', domain: '.douyu.com' },
];

describe('DouyuAuthService.getProfile', () => {
  it('merges the authenticated API profile with cookie data', async () => {
    const urls: string[] = [];
    const service = new DouyuAuthService();
    const profile = await service.getProfile(
      fakeSession(
        AUTH_COOKIES,
        {
          error: 0,
          msg: {
            nickname: 'API 昵称',
            avatar: '//apic.douyucdn.cn/avatar/middle.jpg',
          },
        },
        urls,
      ),
    );

    expect(urls).toEqual(['https://www.douyu.com/lapi/member/api/getInfo']);
    expect(profile).toEqual({
      nickname: 'API 昵称',
      avatarUrl: 'https://apic.douyucdn.cn/avatar/middle.jpg',
    });
  });

  it('keeps the cookie nickname when the profile request fails', async () => {
    const service = new DouyuAuthService();
    const profile = await service.getProfile(
      fakeSession(AUTH_COOKIES, { error: 1, msg: { uid: 0 } }, []),
    );

    expect(profile).toEqual({ nickname: '小斗' });
  });

  it('never throws when cookies cannot be read', async () => {
    const service = new DouyuAuthService();
    const session = {
      cookies: {
        get: async () => {
          throw new Error('cookie store unavailable');
        },
      },
    } as unknown as Session;

    await expect(service.getProfile(session)).resolves.toEqual({});
  });
});
