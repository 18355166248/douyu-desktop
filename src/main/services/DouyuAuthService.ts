import type { Session } from 'electron';
import type { AccountHealth } from '@shared/contracts/account';
import { AppError } from '@core/errors';
import type { DouyuAuthContext, DouyuAuthKind } from '@core/douyu/auth/DouyuAuthContext';
import { CHROME_UA, DOUYU_ORIGIN } from '../constants';
import type { DouyuCredentials } from './DouyuCredentials';
import {
  parseProfilePayload,
  readProfileFromCookies,
  type DouyuProfile,
} from './DouyuProfile';

const DEFAULT_DID = '10000000000000000000000000001501';
const CACHE_MS = 30_000;
const PROFILE_TIMEOUT_MS = 3_500;

interface CacheEntry {
  at: number;
  credentials: DouyuCredentials;
}

export class DouyuAuthService {
  private readonly cache = new WeakMap<Session, CacheEntry>();

  async getCredentials(session: Session): Promise<DouyuCredentials> {
    const cached = this.cache.get(session);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.credentials;

    const cookies = await session.cookies.get({});
    const values = new Map(
      cookies
        .filter((cookie) => cookie.domain?.endsWith('douyu.com') ?? false)
        .map((cookie) => [cookie.name, cookie.value]),
    );
    const uid = values.get('acf_uid');
    const stk = values.get('acf_stk');
    if (!uid || !stk) throw new AppError('AUTH_REQUIRED', '请先登录斗鱼');

    const token = [
      uid,
      values.get('acf_biz') ?? '',
      stk,
      values.get('acf_ct') ?? '',
      values.get('acf_ltkid') ?? '',
    ].join('_');
    const credentials: DouyuCredentials = {
      uid,
      token,
      did: values.get('dy_did') ?? DEFAULT_DID,
      csrfToken: values.get('cvl_csrf_token'),
    };
    this.cache.set(session, { at: Date.now(), credentials });
    return credentials;
  }

  async getProfile(session: Session): Promise<DouyuProfile> {
    try {
      const cookies = await session.cookies.get({});
      const fromCookies = readProfileFromCookies(cookies);

      try {
        await this.getCredentials(session);
      } catch {
        return fromCookies;
      }

      const fromApi = await this.fetchProfile(session);
      const profile: DouyuProfile = {};
      const nickname = fromApi.nickname ?? fromCookies.nickname;
      const avatarUrl = fromApi.avatarUrl ?? fromCookies.avatarUrl;
      if (nickname) profile.nickname = nickname;
      if (avatarUrl) profile.avatarUrl = avatarUrl;
      return profile;
    } catch {
      return {};
    }
  }

  private async fetchProfile(session: Session): Promise<DouyuProfile> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROFILE_TIMEOUT_MS);
    try {
      const response = await session.fetch(`${DOUYU_ORIGIN}/lapi/member/api/getInfo`, {
        headers: {
          Accept: 'application/json',
          'User-Agent': CHROME_UA,
          Referer: `${DOUYU_ORIGIN}/`,
        },
        signal: controller.signal,
      });
      if (response.status !== 200) return {};
      const payload: unknown = await response.json();
      return parseProfilePayload(payload);
    } catch {
      return {};
    } finally {
      clearTimeout(timeout);
    }
  }

  async createAuthContext(session: Session): Promise<DouyuAuthContext> {
    return {
      headers: async (kind: DouyuAuthKind) => {
        const credentials = await this.getCredentials(session);
        if (kind === 'yuba') {
          return {
            'dy-token': credentials.token,
            'dy-client': 'pc',
            'User-Agent': CHROME_UA,
          };
        }
        return {
          token: credentials.token,
          'User-Agent': CHROME_UA,
          ...(kind === 'web' ? { Referer: `${DOUYU_ORIGIN}/` } : { aid: 'android1' }),
        };
      },
      csrfToken: async () => {
        const existing = await this.readCookie(session, 'cvl_csrf_token');
        if (existing) return existing;
        try {
          await session.fetch(`${DOUYU_ORIGIN}/japi/carnival/nc/common/generateCsrf`, {
            method: 'POST',
            headers: {
              'User-Agent': CHROME_UA,
              'Content-Type': 'application/json',
            },
          });
        } catch {
          return '';
        }
        return (await this.readCookie(session, 'cvl_csrf_token')) ?? '';
      },
    };
  }

  async health(session: Session): Promise<AccountHealth> {
    const checkedAt = Date.now();
    try {
      const response = await session.fetch(
        `${DOUYU_ORIGIN}/wgapi/livenc/liveweb/follow/list?page=1`,
        {
          headers: {
            'User-Agent': CHROME_UA,
            Referer: `${DOUYU_ORIGIN}/`,
          },
        },
      );
      if (response.status !== 200) {
        return { status: 'expired', checkedAt, message: `HTTP ${response.status}` };
      }
      const payload = (await response.json()) as { error?: number | string; msg?: string };
      if (Number(payload.error) === 0) return { status: 'active', checkedAt };
      return { status: 'expired', checkedAt, ...(payload.msg ? { message: payload.msg } : {}) };
    } catch {
      return { status: 'expired', checkedAt, message: '登录状态检查失败' };
    }
  }

  private async readCookie(session: Session, name: string): Promise<string | undefined> {
    const cookies = await session.cookies.get({ name });
    return cookies.find((cookie) => cookie.domain?.endsWith('douyu.com') ?? false)?.value;
  }
}
