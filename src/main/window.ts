import { join } from 'node:path';
import { BrowserWindow, shell } from 'electron';
import type { Rectangle } from 'electron';
import { workspaceShortcut } from '@shared/shortcuts';
import { IPC } from '@shared/contracts/ipc';
import { isAllowedExternalUrl } from './constants';
import appIcon from '../../build/icon.png?asset';

export interface CreateMainWindowOptions {
  bounds?: Rectangle;
  secondary?: boolean;
  title?: string;
  workspaceId?: string;
}

export function createMainWindow(options: CreateMainWindowOptions = {}): BrowserWindow {
  const window = new BrowserWindow({
    ...(options.bounds ?? { width: 1440, height: 900 }),
    minWidth: 1100,
    minHeight: 700,
    show: false,
    frame: false,
    thickFrame: true,
    hasShadow: true,
    autoHideMenuBar: true,
    backgroundColor: '#0b0d10',
    title: options.title ?? '斗鱼多屏',
    icon: appIcon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      // Keep live video frames and timers running while the window is covered
      // or left in the background; otherwise audio continues while video is
      // throttled and the picture drifts out of sync until refocus.
      backgroundThrottling: false,
    },
  });

  window.setMenu(null);
  window.webContents.on('before-input-event', (_event, input) => {
    // 只屏蔽由页面接管的菜单快捷键，保留复制、粘贴、退出等系统操作；不能 preventDefault，否则页面也收不到按键。
    window.webContents.setIgnoreMenuShortcuts(
      Boolean(
        workspaceShortcut(
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

  const notifyMaximized = (): void => {
    if (window.isDestroyed() || window.webContents.isDestroyed()) return;
    window.webContents.send(IPC.windowMaximizedChange, window.isMaximized());
  };
  window.on('maximize', notifyMaximized);
  window.on('unmaximize', notifyMaximized);
  window.on('restore', notifyMaximized);
  window.webContents.on('did-finish-load', notifyMaximized);

  window.once('ready-to-show', () => window.show());

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.ELECTRON_RENDERER_URL;
    const allowed = url.startsWith('file://') || (devUrl ? url.startsWith(devUrl) : false);
    if (!allowed) event.preventDefault();
  });

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    const url = new URL(devUrl);
    if (options.secondary) url.searchParams.set('role', 'secondary');
    if (options.workspaceId) url.searchParams.set('workspace', options.workspaceId);
    void window.loadURL(url.toString());
  } else {
    const file = join(__dirname, '../renderer/index.html');
    const query = {
      ...(options.secondary ? { role: 'secondary' } : {}),
      ...(options.workspaceId ? { workspace: options.workspaceId } : {}),
    };
    void window.loadFile(file, { query });
  }

  return window;
}
