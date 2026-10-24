import { randomUUID } from 'node:crypto';
import { BrowserWindow, session, shell, type Session } from 'electron';
import type { AccountHealth, AccountSummary } from '@shared/contracts/account';
import { AppError } from '@core/errors';
import type { DouyuAuthContext } from '@core/douyu/auth/DouyuAuthContext';
import { CHROME_UA, DOUYU_LOGIN_URL, isAllowedExternalUrl, isDouyuUrl } from '../constants';
import type { JsonAccountStore, AccountRecord } from '../adapters/storage/JsonAccountStore';
import type { DouyuAuthService } from './DouyuAuthService';
import type { DouyuProfile } from './DouyuProfile';

function isPlaceholderNickname(nickname: string): boolean {
  return /^斗鱼用户\s+\d+$/u.test(nickname.trim());
}

function applyProfile(record: AccountRecord, profile: DouyuProfile): AccountRecord {
  const nickname = profile.nickname?.trim() || record.nickname;
  const avatarUrl = profile.avatarUrl ?? record.avatarUrl;
  if (nickname === record.nickname && avatarUrl === record.avatarUrl) return record;
  return { ...record, nickname, avatarUrl };
}

function toSummary(record: AccountRecord, activeId: string | null): AccountSummary {
  return {
    id: record.id,
    platform: 'douyu',
    uid: record.uid,
    nickname: record.nickname,
    avatarUrl: record.avatarUrl,
    status: record.status,
    lastLoginAt: record.lastLoginAt,
    isActive: record.id === activeId,
  };
}

export class AccountSessionManager {
  private readonly profileRefreshed = new Set<string>();

  constructor(
    private readonly store: JsonAccountStore,
    private readonly auth: DouyuAuthService,
    private readonly getParentWindow: () => BrowserWindow | null,
  ) {}

  async list(): Promise<AccountSummary[]> {
    const activeId = await this.store.getActiveId();
    const records = await this.store.list();
    const resolved = await Promise.all(records.map((record) => this.refreshProfile(record)));
    return resolved.map((record) => toSummary(record, activeId));
  }

  async getActiveId(): Promise<string | null> {
    return this.store.getActiveId();
  }

  async getSession(accountId: string): Promise<Session> {
    const record = await this.store.get(accountId);
    if (!record) throw new AppError('AUTH_REQUIRED', '账号不存在，请重新登录');
    return session.fromPartition(record.partition);
  }

  private async refreshProfile(record: AccountRecord): Promise<AccountRecord> {
    if (record.status !== 'active' || this.profileRefreshed.has(record.id)) return record;
    this.profileRefreshed.add(record.id);
    if (record.avatarUrl && !isPlaceholderNickname(record.nickname)) return record;

    try {
      const profile = await this.auth.getProfile(session.fromPartition(record.partition));
      const next = applyProfile(record, profile);
      if (next !== record) await this.store.upsert(next);
      return next;
    } catch {
      return record;
    }
  }

  async createAuthContext(accountId: string): Promise<DouyuAuthContext> {
    return this.auth.createAuthContext(await this.getSession(accountId));
  }

  async health(accountId: string): Promise<AccountHealth> {
    const accountSession = await this.getSession(accountId);
    const health = await this.auth.health(accountSession);
    await this.store.updateStatus(accountId, health.status);
    return health;
  }

  async switchAccount(accountId: string): Promise<void> {
    const record = await this.store.get(accountId);
    if (!record) throw new AppError('AUTH_REQUIRED', '账号不存在');
    await this.store.setActive(accountId);
  }

  async logout(accountId: string): Promise<void> {
    const record = await this.store.get(accountId);
    if (!record) return;
    await this.store.remove(accountId);
    await session.fromPartition(record.partition).clearStorageData();
  }

  async login(): Promise<AccountSummary> {
    const accountId = randomUUID();
    const partition = `persist:douyu-account-${accountId}`;
    const loginSession = session.fromPartition(partition);
    loginSession.setUserAgent(CHROME_UA);

    const parent = this.getParentWindow();
    const loginWindow = new BrowserWindow({
      width: 520,
      height: 720,
      minWidth: 420,
      minHeight: 620,
      title: '登录斗鱼',
      show: false,
      autoHideMenuBar: true,
      backgroundColor: '#0b0d10',
      ...(parent ? { parent } : {}),
      webPreferences: {
        partition,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    loginWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (isDouyuUrl(url)) return { action: 'allow' };
      if (isAllowedExternalUrl(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    loginWindow.once('ready-to-show', () => loginWindow.show());
    void loginWindow.loadURL(DOUYU_LOGIN_URL);

    return new Promise<AccountSummary>((resolve, reject) => {
      let settled = false;
      let checking = false;
      const timers: {
        interval?: ReturnType<typeof setInterval>;
        timeout?: ReturnType<typeof setTimeout>;
      } = {};

      const finish = (action: () => void): void => {
        if (settled) return;
        settled = true;
        if (timers.interval) clearInterval(timers.interval);
        if (timers.timeout) clearTimeout(timers.timeout);
        if (!loginWindow.isDestroyed()) loginWindow.close();
        action();
      };

      const fail = (error: unknown): void => {
        finish(() => reject(error));
      };

      const succeed = async (): Promise<void> => {
        try {
          const credentials = await this.auth.getCredentials(loginSession);
          const profile = await this.auth.getProfile(loginSession);
          const nickname = profile.nickname?.trim();
          const record: AccountRecord = {
            id: accountId,
            uid: credentials.uid,
            nickname: nickname || `斗鱼用户 ${credentials.uid}`,
            avatarUrl: profile.avatarUrl ?? '',
            partition,
            lastLoginAt: Date.now(),
            status: 'active',
          };
          await this.store.upsert(record);
          await this.store.setActive(record.id);
          finish(() => resolve(toSummary(record, record.id)));
        } catch (error) {
          fail(error);
        }
      };

      timers.interval = setInterval(() => {
        if (settled || checking) return;
        checking = true;
        void this.auth
          .getCredentials(loginSession)
          .then(async () => {
            await succeed();
          })
          .catch((error: unknown) => {
            if (!(error instanceof AppError && error.code === 'AUTH_REQUIRED')) fail(error);
          })
          .finally(() => {
            checking = false;
          });
      }, 600);

      timers.timeout = setTimeout(
        () => {
          fail(new AppError('AUTH_REQUIRED', '登录超时，请重试'));
        },
        5 * 60 * 1000,
      );

      loginWindow.on('closed', () => {
        if (settled) return;
        void this.auth
          .getCredentials(loginSession)
          .then(async () => {
            await succeed();
          })
          .catch(() => {
            fail(new AppError('AUTH_REQUIRED', '登录已取消'));
          });
      });
    });
  }
}
