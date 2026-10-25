import { describe, expect, it } from 'vitest';
import {
  hasBilibiliSession,
  parseBilibiliNav,
  readHuyaIdentity,
  toPlatformStatus,
} from './PlatformLoginProfile';

describe('hasBilibiliSession', () => {
  it('requires a non-empty SESSDATA cookie', () => {
    expect(hasBilibiliSession([{ name: 'SESSDATA', value: 'abc' }])).toBe(true);
    expect(hasBilibiliSession([{ name: 'SESSDATA', value: '' }])).toBe(false);
    expect(hasBilibiliSession([{ name: 'DedeUserID', value: '1' }])).toBe(false);
  });
});

describe('parseBilibiliNav', () => {
  it('reads the nickname and upgrades protocol-relative avatars', () => {
    expect(
      parseBilibiliNav({
        code: 0,
        data: {
          isLogin: true,
          uname: '哔哩用户',
          face: '//i0.hdslb.com/bfs/face/a.jpg',
        },
      }),
    ).toEqual({
      loggedIn: true,
      nickname: '哔哩用户',
      avatarUrl: 'https://i0.hdslb.com/bfs/face/a.jpg',
    });
  });

  it('falls back to a generic nickname when the profile is incomplete', () => {
    expect(parseBilibiliNav({ code: 0, data: { isLogin: true, uname: '', face: '' } })).toEqual({
      loggedIn: true,
      nickname: 'B站用户',
      avatarUrl: '',
    });
  });

  it('treats expired or failed responses as logged out', () => {
    const expired = parseBilibiliNav({ code: -101, message: '账号未登录' });
    expect(expired.loggedIn).toBe(false);
    expect(expired.message).toBe('账号未登录');

    const failed = parseBilibiliNav({ code: 0, data: { isLogin: false } });
    expect(failed.loggedIn).toBe(false);
    expect(failed.message).toBe('B站登录已过期');
  });
});

describe('readHuyaIdentity', () => {
  it('reads uid, decoded nickname and avatar cookies', () => {
    expect(
      readHuyaIdentity([
        { name: 'udb_uid', value: '12345' },
        { name: 'username', value: '%E8%99%8E%E7%89%99%E7%94%A8%E6%88%B7' },
        { name: 'udb_avatar', value: 'http://a.msstatic.com/avatar.jpg' },
      ]),
    ).toEqual({
      loggedIn: true,
      nickname: '虎牙用户',
      avatarUrl: 'https://a.msstatic.com/avatar.jpg',
    });
  });

  it('requires a real uid and falls back when no nickname is stored', () => {
    expect(readHuyaIdentity([{ name: 'udb_uid', value: '0' }]).loggedIn).toBe(false);
    expect(readHuyaIdentity([{ name: 'udb_uid', value: '12345' }])).toEqual({
      loggedIn: true,
      nickname: '虎牙用户',
      avatarUrl: '',
    });
  });
});

describe('toPlatformStatus', () => {
  it('omits an empty message', () => {
    expect(
      toPlatformStatus('bilibili', { loggedIn: true, nickname: 'A', avatarUrl: '' }),
    ).toEqual({
      platform: 'bilibili',
      loggedIn: true,
      nickname: 'A',
      avatarUrl: '',
    });
  });
});
