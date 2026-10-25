import type { Session } from 'electron';
import { CHROME_UA } from '../constants';
import { parseHuyaAvatar, parseHuyaUserNick } from './PlatformLoginProfile';

const HUYA_NICK_URL =
  'https://www.huya.com/udb_web/udbport2.php?m=HuyaOutside&do=checkUserNick&callback=huya_profile';
const HUYA_AVATAR_URL = 'https://user.huya.com/user/getUserInfo';
const PROFILE_TIMEOUT_MS = 3_500;

export interface HuyaProfile {
  nickname?: string;
  avatarUrl?: string;
}

async function fetchText(session: Session, url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROFILE_TIMEOUT_MS);
  try {
    const response = await session.fetch(url, {
      credentials: 'include',
      headers: {
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'User-Agent': CHROME_UA,
      },
      signal: controller.signal,
    });
    if (!response.ok) return '';
    return await response.text();
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchHuyaProfile(session: Session, uid: string): Promise<HuyaProfile> {
  if (!uid) return {};

  const [nickText, avatarText] = await Promise.all([
    fetchText(session, HUYA_NICK_URL),
    fetchText(session, `${HUYA_AVATAR_URL}?uid=${encodeURIComponent(uid)}`),
  ]);

  const nickname = parseHuyaUserNick(nickText);
  const avatarUrl = parseHuyaAvatar(avatarText);
  return {
    ...(nickname ? { nickname } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
  };
}
