import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { shell, type Session, type WebContents } from 'electron';
import { AppError } from '@core/errors';
import { yubaShortcut } from '@shared/shortcuts';
import { YUBA_JOINED_URL, YUBA_ORIGIN } from '@shared/yuba';
import { CHROME_UA, isAllowedExternalUrl } from './constants';

interface ViewGrant {
  token: string;
  session: Session;
}

const hosts = new WeakMap<WebContents, { grant?: ViewGrant }>();

function isYubaPage(value: string): boolean {
  try {
    const url = new URL(value);
    return url.origin === YUBA_ORIGIN && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function prepareYubaView(host: WebContents, accountSession: Session): string {
  const state = hosts.get(host);
  if (!state || host.isDestroyed()) throw new AppError('INVALID_INPUT', '鱼吧窗口不可用');
  const token = randomUUID();
  state.grant = { token, session: accountSession };
  return token;
}

export function registerYubaView(host: WebContents): void {
  const state: { grant?: ViewGrant } = {};
  hosts.set(host, state);

  host.on('will-attach-webview', (event, preferences, params) => {
    const grant = state.grant;
    if (!grant || params.src !== YUBA_JOINED_URL || params.partition !== grant.token) {
      event.preventDefault();
      return;
    }
    delete state.grant;

    // A guest gets the main-process account session and no renderer-supplied preferences.
    for (const key of Object.keys(preferences) as Array<keyof typeof preferences>) {
      delete preferences[key];
    }
    Object.assign(preferences, {
      session: grant.session,
      preload: join(__dirname, '../preload/yuba.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      navigateOnDragDrop: false,
    });
    delete params.httpreferrer;
    params.useragent = CHROME_UA;
  });

  host.on('did-attach-webview', (_event, guest) => {
    guest.on('before-input-event', (_inputEvent, input) => {
      guest.setIgnoreMenuShortcuts(
        Boolean(
          yubaShortcut(
            {
              key: input.key,
              ctrlKey: input.control,
              metaKey: input.meta,
              altKey: input.alt,
              shiftKey: input.shift,
            },
            process.platform === 'darwin',
          ),
        ),
      );
    });
    guest.setWindowOpenHandler(({ url }) => {
      if (isYubaPage(url)) void guest.loadURL(url).catch(() => undefined);
      else if (isAllowedExternalUrl(url)) void shell.openExternal(url).catch(() => undefined);
      return { action: 'deny' };
    });
    guest.on('will-navigate', (event) => {
      if (isYubaPage(event.url)) return;
      event.preventDefault();
      if (isAllowedExternalUrl(event.url))
        void shell.openExternal(event.url).catch(() => undefined);
    });
    guest.on('will-redirect', (event) => {
      if (event.isMainFrame && !isYubaPage(event.url)) event.preventDefault();
    });
  });
}
