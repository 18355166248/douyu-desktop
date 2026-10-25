import { join } from 'node:path';
import { BrowserWindow, shell } from 'electron';
import type { Rectangle } from 'electron';
import { IPC } from '@shared/contracts/ipc';
import { isAllowedExternalUrl } from './constants';

export interface CreateMainWindowOptions {
  bounds?: Rectangle;
  secondary?: boolean;
  title?: string;
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
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  window.setMenu(null);

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
    void window.loadURL(url.toString());
  } else {
    const file = join(__dirname, '../renderer/index.html');
    if (options.secondary) void window.loadFile(file, { query: { role: 'secondary' } });
    else void window.loadFile(file);
  }

  return window;
}
