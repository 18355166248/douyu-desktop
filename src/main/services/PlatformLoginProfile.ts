import type { PlatformLoginStatus } from '@shared/contracts/platformLogin';

export interface LoginCookie {
  name: string;
  value: string;
}

interface Identity {
  loggedIn: boolean;
  nickname: string;
  avatarUrl: string;
  message?: string;
}

function normalizeAvatar(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (trimmed.startsWith('http://')) return `https://${trimmed.slice('http://'.length)}`;
  return trimmed.startsWith('https://') ? trimmed : '';
}

function decode(value: string | undefined): string {
  if (!value) return '';
  let current = value;
  for (let index = 0; index < 2; index += 1) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      current = decoded;
    } catch {
      break;
    }
  }
  return current.trim();
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function parseJsonp(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!text) return undefined;
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return undefined;
    }
  }
  const start = text.indexOf('(');
  const end = text.lastIndexOf(')');
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start + 1, end)) as unknown;
  } catch {
    return undefined;
  }
}

export function parseHuyaUserNick(payload: unknown): string {
  const record = asRecord(parseJsonp(payload));
  const nickname = record?.userNick;
  return typeof nickname === 'string' ? nickname.trim() : '';
}

export function parseHuyaAvatar(payload: unknown): string {
  const record = asRecord(parseJsonp(payload));
  const data = asRecord(record?.data);
  return normalizeAvatar(data?.avatar);
}

function cookieValues(cookies: readonly LoginCookie[]): Map<string, string> {
  return new Map(cookies.map((cookie) => [cookie.name, cookie.value]));
}

export function hasBilibiliSession(cookies: readonly LoginCookie[]): boolean {
  return Boolean(cookieValues(cookies).get('SESSDATA'));
}

export function parseBilibiliNav(payload: unknown): Identity {
  if (!payload || typeof payload !== 'object') {
    return {
      loggedIn: false,
      nickname: '',
      avatarUrl: '',
      message: '登录状态检查失败',
    };
  }

  const record = payload as {
    code?: number | string;
    message?: string;
    data?: { isLogin?: boolean; uname?: string; face?: string };
  };
  const data = record.data;
  if (Number(record.code) === 0 && data?.isLogin === true) {
    return {
      loggedIn: true,
      nickname: typeof data.uname === 'string' && data.uname.trim() ? data.uname.trim() : 'B站用户',
      avatarUrl: normalizeAvatar(data.face),
    };
  }

  return {
    loggedIn: false,
    nickname: '',
    avatarUrl: '',
    message: typeof record.message === 'string' && record.message ? record.message : 'B站登录已过期',
  };
}

export function readHuyaIdentity(cookies: readonly LoginCookie[]): Identity {
  const values = cookieValues(cookies);
  const uid = values.get('udb_uid');
  if (!uid || uid === '0') {
    return { loggedIn: false, nickname: '', avatarUrl: '' };
  }

  return {
    loggedIn: true,
    nickname: decode(values.get('udb_nickname')) || '虎牙用户',
    avatarUrl: normalizeAvatar(values.get('udb_avatar')),
  };
}

export function toPlatformStatus(
  platform: PlatformLoginStatus['platform'],
  identity: Identity,
): PlatformLoginStatus {
  return {
    platform,
    loggedIn: identity.loggedIn,
    nickname: identity.nickname,
    avatarUrl: identity.avatarUrl,
    ...(identity.message ? { message: identity.message } : {}),
  };
}
