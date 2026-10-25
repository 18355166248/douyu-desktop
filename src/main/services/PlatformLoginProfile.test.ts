import { describe, expect, it } from 'vitest';
import {
  hasBilibiliSession,
  parseBilibiliNav,
  parseHuyaAvatar,
  parseHuyaUserNick,
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
        { name: 'udb_nickname', value: '%E6%9F%92%E4%B8%96' },
        { name: 'udb_avatar', value: 'http://a.msstatic.com/avatar.jpg' },
      ]),
    ).toEqual({
      loggedIn: true,
      nickname: '柒世',
      avatarUrl: 'https://a.msstatic.com/avatar.jpg',
    });
  });

  it('does not use the passport username as the display nickname', () => {
    expect(
      readHuyaIdentity([
        { name: 'udb_uid', value: '12345' },
        { name: 'username', value: 'qq_9r1f8o07fgtf' },
      ]),
    ).toEqual({
      loggedIn: true,
      nickname: '虎牙用户',
      avatarUrl: '',
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

describe('Huya profile payloads', () => {
  it('parses the JSONP nickname response', () => {
    expect(parseHuyaUserNick('cb({"userNick":"\\u67d2\\u4e16","userLogo":""})')).toBe('柒世');
  });

  it('parses the avatar response', () => {
    expect(
      parseHuyaAvatar(
        JSON.stringify({
          code: 200,
          data: {
            uid: 2336130853,
            avatar:
              'https://huyaimg.msstatic.com/avatar/1074/62/4945e91e569dd2e69a721cf044d430_180_135.jpg?1555418061',
          },
          message: '请求成功',
        }),
      ),
    ).toBe(
      'https://huyaimg.msstatic.com/avatar/1074/62/4945e91e569dd2e69a721cf044d430_180_135.jpg?1555418061',
    );
  });

  it('returns an empty value for malformed payloads', () => {
    expect(parseHuyaUserNick('<html>')).toBe('');
    expect(parseHuyaAvatar('not-json')).toBe('');
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
