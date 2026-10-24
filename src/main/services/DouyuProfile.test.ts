import { describe, expect, it } from 'vitest';
import {
  normalizeAvatarUrl,
  parseProfilePayload,
  readProfileFromCookies,
} from './DouyuProfile';

describe('parseProfilePayload', () => {
  it('reads the profile from the authenticated getInfo response', () => {
    expect(
      parseProfilePayload({
        error: 0,
        msg: {
          uid: 6050416,
          nickname: '小斗',
          avatar: '//apic.douyucdn.cn/upload/avatar_v3/a_middle.jpg',
        },
      }),
    ).toEqual({
      nickname: '小斗',
      avatarUrl: 'https://apic.douyucdn.cn/upload/avatar_v3/a_middle.jpg',
    });
  });

  it('supports nested user info containers and alternate field names', () => {
    expect(
      parseProfilePayload({
        data: {
          userInfo: {
            nickName: 'Nested',
            avatar_url: 'http://apic.douyucdn.cn/upload/avatar_v3/b_middle.jpg',
          },
        },
      }),
    ).toEqual({
      nickname: 'Nested',
      avatarUrl: 'https://apic.douyucdn.cn/upload/avatar_v3/b_middle.jpg',
    });
  });

  it('supports the nested avatar size object', () => {
    expect(
      parseProfilePayload({
        error: 0,
        msg: {
          nickname: '小斗',
          avatar: {
            small: '//apic.douyucdn.cn/avatar/small.jpg',
            middle: '//apic.douyucdn.cn/avatar/middle.jpg',
            big: '//apic.douyucdn.cn/avatar/big.jpg',
          },
        },
      }),
    ).toEqual({
      nickname: '小斗',
      avatarUrl: 'https://apic.douyucdn.cn/avatar/middle.jpg',
    });
  });

  it('ignores failed responses', () => {
    expect(
      parseProfilePayload({
        error: 1,
        msg: { uid: 0, nickname: 'not logged in', avatar: '//example.com/a.jpg' },
      }),
    ).toEqual({});
  });
});

describe('readProfileFromCookies', () => {
  it('decodes the nickname cookie and reads the avatar cookie', () => {
    expect(
      readProfileFromCookies([
        { name: 'acf_nickname', value: '%E5%B0%8F%E6%96%97', domain: '.douyu.com' },
        { name: 'acf_avatar', value: '//apic.douyucdn.cn/a.jpg', domain: '.douyu.com' },
      ]),
    ).toEqual({
      nickname: '小斗',
      avatarUrl: 'https://apic.douyucdn.cn/a.jpg',
    });
  });

  it('ignores cookies from other domains', () => {
    expect(
      readProfileFromCookies([
        { name: 'acf_nickname', value: 'evil', domain: '.example.com' },
      ]),
    ).toEqual({});
  });
});

describe('normalizeAvatarUrl', () => {
  it('upgrades http avatars to https', () => {
    expect(normalizeAvatarUrl('http://apic.douyucdn.cn/a.jpg')).toBe(
      'https://apic.douyucdn.cn/a.jpg',
    );
  });

  it('rejects unsupported protocols and empty values', () => {
    expect(normalizeAvatarUrl('javascript:alert(1)')).toBeUndefined();
    expect(normalizeAvatarUrl('')).toBeUndefined();
    expect(normalizeAvatarUrl(undefined)).toBeUndefined();
  });
});
