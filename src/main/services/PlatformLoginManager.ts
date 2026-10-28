import { BrowserWindow, session, shell, type Session } from 'electron';
import appIcon from '../../../build/icon.png?asset';
import type { GuidedPlatform, PlatformLoginStatus } from '@shared/contracts/platformLogin';
import { AppError } from '@core/errors';
import { CHROME_UA, isAllowedExternalUrl } from '../constants';
import {
  hasBilibiliSession,
  parseBilibiliNav,
  readHuyaIdentity,
  toPlatformStatus,
} from './PlatformLoginProfile';
import { fetchHuyaProfile, type HuyaProfile } from './HuyaProfile';

const PARTITIONS: Readonly<Record<GuidedPlatform, string>> = {
  bilibili: 'persist:bilibili-login',
  huya: 'persist:huya-login',
};

const LOGIN_URLS: Readonly<Record<GuidedPlatform, string>> = {
  bilibili: 'https://passport.bilibili.com/login',
  huya: 'https://www.huya.com/',
};

const PLATFORM_LABELS: Readonly<Record<GuidedPlatform, string>> = {
  bilibili: 'B 站',
  huya: '虎牙',
};

const BILIBILI_NAV_URL = 'https://api.bilibili.com/x/web-interface/nav';
const BILIBILI_REFERER = 'https://live.bilibili.com/';
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const STATUS_TIMEOUT_MS = 4_000;
const HUYA_PROFILE_CACHE_MS = 5 * 60 * 1000;
const HUYA_PROFILE_RETRY_MS = 5_000;

interface CacheEntry {
  profile: HuyaProfile;
  at: number;
}

interface HuyaLoginProbe {
  opened: boolean;
}

const HUYA_LOGIN_PROBE_SCRIPT = `(() => {
  const frame = [...document.querySelectorAll('iframe')].find(
    (element) => element.src.includes('aq.huya.com/p/udb_login.html') && element.clientWidth > 0
  );
  if (frame) return { opened: true };

  const candidates = [
    ...document.querySelectorAll('#J_duyaHeaderRight a, #J_duyaHeaderRight div, #J_duyaHeaderRight span')
  ];
  const target =
    candidates.find(
      (element) => element.tagName === 'A' && element.textContent?.trim() === '登录'
    ) ?? candidates.find((element) => element.textContent?.trim() === '登录');
  if (!target) return { opened: false };

  target.click();
  return { opened: false };
})()`;

function isBilibiliUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'bilibili.com' || url.hostname.endsWith('.bilibili.com'))
    );
  } catch {
    return false;
  }
}

function isHuyaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'huya.com' ||
        url.hostname.endsWith('.huya.com') ||
        url.hostname === 'yy.com' ||
        url.hostname.endsWith('.yy.com'))
    );
  } catch {
    return false;
  }
}

function isLoginUrl(platform: GuidedPlatform, value: string): boolean {
  return platform === 'bilibili' ? isBilibiliUrl(value) : isHuyaUrl(value);
}

export class PlatformLoginManager {
  private readonly pending = new Map<GuidedPlatform, Promise<PlatformLoginStatus>>();
  private readonly huyaProfiles = new Map<string, CacheEntry>();

  constructor(private readonly getParentWindow: () => BrowserWindow | null) {}

  getSession(platform: GuidedPlatform): Session {
    const loginSession = session.fromPartition(PARTITIONS[platform]);
    loginSession.setUserAgent(CHROME_UA);
    return loginSession;
  }

  async status(platform: GuidedPlatform): Promise<PlatformLoginStatus> {
    return this.readStatus(platform, this.getSession(platform), false);
  }

  async login(platform: GuidedPlatform): Promise<PlatformLoginStatus> {
    const existing = this.pending.get(platform);
    if (existing) return existing;

    const task = this.openLoginWindow(platform).finally(() => {
      this.pending.delete(platform);
    });
    this.pending.set(platform, task);
    return task;
  }

  async logout(platform: GuidedPlatform): Promise<void> {
    this.huyaProfiles.clear();
    await this.getSession(platform).clearStorageData();
  }

  private async readStatus(
    platform: GuidedPlatform,
    loginSession: Session,
    strict: boolean,
  ): Promise<PlatformLoginStatus> {
    if (platform === 'huya') {
      const cookies = await loginSession.cookies.get({});
      const identity = readHuyaIdentity(cookies);
      if (!identity.loggedIn) {
        return toPlatformStatus(platform, identity);
      }

      const uid = cookies.find((cookie) => cookie.name === 'udb_uid')?.value ?? '';
      const now = Date.now();
      const cached = this.huyaProfiles.get(uid);
      const cachedAt = cached?.at ?? 0;
      const complete = Boolean(cached?.profile.nickname && cached.profile.avatarUrl);
      const maxAge = complete ? HUYA_PROFILE_CACHE_MS : HUYA_PROFILE_RETRY_MS;
      let profile = cached?.profile ?? {};

      if (!cached || now - cachedAt > maxAge) {
        profile = await fetchHuyaProfile(loginSession, uid);
        this.huyaProfiles.set(uid, { profile, at: now });
      }

      return toPlatformStatus(platform, {
        loggedIn: true,
        nickname: profile.nickname || identity.nickname,
        avatarUrl: profile.avatarUrl || identity.avatarUrl,
      });
    }

    const cookies = await loginSession.cookies.get({});
    if (!hasBilibiliSession(cookies)) {
      return toPlatformStatus(platform, { loggedIn: false, nickname: '', avatarUrl: '' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS);
    try {
      const response = await loginSession.fetch(BILIBILI_NAV_URL, {
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'User-Agent': CHROME_UA,
          Referer: BILIBILI_REFERER,
        },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload: unknown = await response.json();
      return toPlatformStatus(platform, parseBilibiliNav(payload));
    } catch {
      if (strict) {
        return toPlatformStatus(platform, {
          loggedIn: false,
          nickname: '',
          avatarUrl: '',
          message: '登录状态检查失败',
        });
      }
      return toPlatformStatus(platform, {
        loggedIn: true,
        nickname: 'B站用户',
        avatarUrl: '',
        message: '登录状态检查失败',
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async openHuyaLoginModal(loginWindow: BrowserWindow): Promise<void> {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      if (loginWindow.isDestroyed()) return;
      try {
        const probe = (await loginWindow.webContents.executeJavaScript(
          HUYA_LOGIN_PROBE_SCRIPT,
          true,
        )) as HuyaLoginProbe;
        if (probe.opened) return;
      } catch {
        // Page context can be replaced while the homepage hydrates; retry.
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  private openLoginWindow(platform: GuidedPlatform): Promise<PlatformLoginStatus> {
    const loginSession = this.getSession(platform);
    const parent = this.getParentWindow();

    return new Promise((resolve, reject) => {
      let settled = false;
      let checking = false;

      const loginWindow = new BrowserWindow({
        ...(parent && !parent.isDestroyed() ? { parent } : {}),
        width: platform === 'huya' ? 760 : 520,
        height: 760,
        minWidth: platform === 'huya' ? 620 : 440,
        minHeight: 620,
        title: `登录${PLATFORM_LABELS[platform]}`,
        icon: appIcon,
        autoHideMenuBar: true,
        backgroundColor: '#0b0f13',
        show: false,
        webPreferences: {
          partition: PARTITIONS[platform],
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          spellcheck: false,
        },
      });

      loginWindow.on('page-title-updated', (event) => event.preventDefault());
      if (platform === 'huya') loginWindow.webContents.setAudioMuted(true);
      loginWindow.once('ready-to-show', () => {
        if (platform !== 'huya') loginWindow.show();
      });

      loginWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (isLoginUrl(platform, url)) return { action: 'allow' };
        if (isAllowedExternalUrl(url)) void shell.openExternal(url);
        return { action: 'deny' };
      });

      const timer = setInterval(() => {
        void check();
      }, 700);

      const timeout = setTimeout(() => {
        fail(new AppError('AUTH_REQUIRED', '登录超时，请重试'));
      }, LOGIN_TIMEOUT_MS);

      const cleanup = (): void => {
        clearInterval(timer);
        clearTimeout(timeout);
      };

      const closeWindow = (): void => {
        if (!loginWindow.isDestroyed()) loginWindow.close();
      };

      const succeed = (status: PlatformLoginStatus): void => {
        if (settled) return;
        settled = true;
        cleanup();
        closeWindow();
        resolve(status);
      };

      const fail = (error: unknown): void => {
        if (settled) return;
        settled = true;
        cleanup();
        closeWindow();
        reject(error);
      };

      const check = async (): Promise<void> => {
        if (settled || checking) return;
        checking = true;
        try {
          const status = await this.readStatus(platform, loginSession, true);
          if (status.loggedIn) succeed(status);
        } catch {
          // Keep the window open; transient cookie/API errors are retryable.
        } finally {
          checking = false;
        }
      };

      loginWindow.on('closed', () => {
        if (settled) return;
        cleanup();
        void this.readStatus(platform, loginSession, true)
          .then((status) => {
            if (status.loggedIn) {
              settled = true;
              resolve(status);
              return;
            }
            settled = true;
            reject(new AppError('AUTH_REQUIRED', '登录已取消'));
          })
          .catch(() => {
            settled = true;
            reject(new AppError('AUTH_REQUIRED', '登录已取消'));
          });
      });

      void loginWindow
        .loadURL(LOGIN_URLS[platform])
        .then(async () => {
          if (platform !== 'huya') return;
          await this.openHuyaLoginModal(loginWindow);
          if (!loginWindow.isDestroyed()) loginWindow.show();
        })
        .catch((error: unknown) => {
          fail(
            new AppError(
              'NETWORK',
              error instanceof Error ? `登录页加载失败：${error.message}` : '登录页加载失败',
            ),
          );
        });
    });
  }
}
