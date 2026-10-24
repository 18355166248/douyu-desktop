export interface DouyuProfile {
  nickname?: string;
  avatarUrl?: string;
}

export interface ProfileCookie {
  name: string;
  value: string;
  domain?: string;
}

const NICKNAME_KEYS = [
  'nickname',
  'nickName',
  'nick_name',
  'userName',
  'user_name',
  'name',
] as const;

const AVATAR_KEYS = [
  'avatar',
  'avatarUrl',
  'avatar_url',
  'avatarV3',
  'avatar_v3',
  'avatarMiddle',
  'avatar_middle',
  'headImage',
  'head_image',
  'head_img',
  'icon',
] as const;

const AVATAR_CHILD_KEYS = ['middle', 'big', 'small', 'url', 'src'] as const;

const CONTAINER_KEYS = [
  'data',
  'msg',
  'result',
  'user',
  'userInfo',
  'info',
  'profile',
  'member',
] as const;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function isDouyuDomain(domain: string | undefined): boolean {
  if (!domain) return true;
  return domain === 'douyu.com' || domain.endsWith('.douyu.com');
}

function decodeCookieValue(value: string): string {
  if (!value.includes('%')) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function readString(record: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function readAvatarValue(value: unknown, depth = 0): string | undefined {
  if (typeof value === 'string') return normalizeAvatarUrl(value);
  const record = asRecord(value);
  if (!record || depth >= 2) return undefined;

  for (const key of AVATAR_CHILD_KEYS) {
    const avatarUrl = readAvatarValue(record[key], depth + 1);
    if (avatarUrl) return avatarUrl;
  }
  return undefined;
}

function readAvatar(record: Record<string, unknown>): string | undefined {
  for (const key of AVATAR_KEYS) {
    const avatarUrl = readAvatarValue(record[key]);
    if (avatarUrl) return avatarUrl;
  }
  return undefined;
}

function collectRecords(
  value: unknown,
  depth: number,
  output: Record<string, unknown>[],
): void {
  const record = asRecord(value);
  if (!record) return;
  output.push(record);
  if (depth >= 3) return;

  for (const key of CONTAINER_KEYS) {
    const child = record[key];
    if (Array.isArray(child)) {
      for (const item of child.slice(0, 3)) collectRecords(item, depth + 1, output);
    } else {
      collectRecords(child, depth + 1, output);
    }
  }
}

export function normalizeAvatarUrl(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;

  let candidate = value;
  if (candidate.startsWith('//')) candidate = `https:${candidate}`;
  else if (candidate.startsWith('/')) candidate = `https://www.douyu.com${candidate}`;

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    if (url.protocol === 'http:') url.protocol = 'https:';
    return url.toString();
  } catch {
    return undefined;
  }
}

export function readProfileFromCookies(cookies: readonly ProfileCookie[]): DouyuProfile {
  const values = new Map<string, string>();
  for (const cookie of cookies) {
    if (!isDouyuDomain(cookie.domain)) continue;
    values.set(cookie.name, cookie.value);
  }

  const rawNickname = values.get('acf_nickname');
  const nickname = rawNickname ? decodeCookieValue(rawNickname).trim() : '';
  const rawAvatar = values.get('acf_avatar') ?? values.get('acf_avatar_url');
  const avatarUrl = normalizeAvatarUrl(rawAvatar ? decodeCookieValue(rawAvatar) : undefined);

  const profile: DouyuProfile = {};
  if (nickname) profile.nickname = nickname;
  if (avatarUrl) profile.avatarUrl = avatarUrl;
  return profile;
}

export function parseProfilePayload(payload: unknown): DouyuProfile {
  const root = asRecord(payload);
  if (!root) return {};

  const error = root.error ?? root.code;
  if (typeof error === 'number' && error !== 0) return {};

  const records: Record<string, unknown>[] = [];
  collectRecords(payload, 0, records);

  let nickname: string | undefined;
  let avatarUrl: string | undefined;
  for (const record of records) {
    nickname ??= readString(record, NICKNAME_KEYS);
    avatarUrl ??= readAvatar(record);
    if (nickname && avatarUrl) break;
  }

  const profile: DouyuProfile = {};
  if (nickname) profile.nickname = nickname;
  if (avatarUrl) profile.avatarUrl = avatarUrl;
  return profile;
}
