import { join } from 'node:path';
import { app, BrowserWindow, screen } from 'electron';
import { JsonAccountStore } from './adapters/storage/JsonAccountStore';
import { JsonRoomHistoryStore } from './adapters/storage/JsonRoomHistoryStore';
import { JsonLogger } from './adapters/electron/JsonLogger';
import { configureMediaCors } from './mediaCors';
import { AccountSessionManager } from './services/AccountSessionManager';
import { DouyuAuthService } from './services/DouyuAuthService';
import { DouyuDanmakuSession } from './services/DouyuDanmakuSession';
import { HuyaDanmakuSession } from './services/HuyaDanmakuSession';
import { PlatformLoginManager } from './services/PlatformLoginManager';
import { StreamService } from './services/StreamService';
import { TaskService } from './services/TaskService';
import { LegacyDevHistoryMigration } from './services/LegacyDevHistoryMigration';
import { registerIpcHandlers } from './ipc';
import { createMainWindow } from './window';
import type { CreateMainWindowOptions } from './window';
import { chooseNewWindowBounds } from './windowPlacement';

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const MAX_APP_WINDOWS = 4;
const appWindows = new Set<BrowserWindow>();
let mainWindow: BrowserWindow | null = null;
let hasCreatedMainWindow = false;

function createAppWindow(options: CreateMainWindowOptions = {}): BrowserWindow {
  const window = createMainWindow(options);
  appWindows.add(window);
  window.on('closed', () => appWindows.delete(window));
  return window;
}

function openSecondaryWindow(source: BrowserWindow | null): void {
  for (const window of appWindows) {
    if (window.isDestroyed()) appWindows.delete(window);
  }
  if (appWindows.size >= MAX_APP_WINDOWS) {
    source?.focus();
    return;
  }

  const displays = screen.getAllDisplays();
  const occupied = [...appWindows]
    .filter((window) => !window.isDestroyed())
    .map((window) => screen.getDisplayMatching(window.getBounds()).id);
  const sourceDisplayId =
    source && !source.isDestroyed() ? screen.getDisplayMatching(source.getBounds()).id : undefined;
  const bounds = chooseNewWindowBounds(displays, occupied, sourceDisplayId);
  const options: CreateMainWindowOptions = {
    secondary: true,
    title: '斗鱼多屏 · 副屏',
  };
  if (bounds) options.bounds = bounds;

  const window = createAppWindow(options);
  window.once('ready-to-show', () => window.focus());
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const target =
      mainWindow && !mainWindow.isDestroyed()
        ? mainWindow
        : [...appWindows].find((window) => !window.isDestroyed());
    if (!target) return;
    if (target.isMinimized()) target.restore();
    target.focus();
  });

  app
    .whenReady()
    .then(async () => {
      app.setAppUserModelId('com.douyu.desktop');
      configureMediaCors();

      const logger = new JsonLogger();
      const store = new JsonAccountStore(join(app.getPath('userData'), 'accounts.json'));
      const history = new JsonRoomHistoryStore(
        join(app.getPath('home'), '.douyu-desktop', 'room-history.json'),
      );
      await new LegacyDevHistoryMigration(
        history,
        join(app.getPath('userData'), 'legacy-dev-history-migrated.v1.json'),
        logger,
      ).migrate();
      const auth = new DouyuAuthService();
      const accounts = new AccountSessionManager(store, auth, () => mainWindow);
      const platforms = new PlatformLoginManager(() => mainWindow);
      const streams = new StreamService(platforms);
      const tasks = new TaskService(accounts, logger);
      const douyuDanmaku = new DouyuDanmakuSession();
      const huyaDanmaku = new HuyaDanmakuSession();

      app.on('before-quit', () => {
        streams.stop();
        huyaDanmaku.stopAll();
      });
      await streams.start();

      registerIpcHandlers({
        accounts,
        platforms,
        streams,
        tasks,
        history,
        douyuDanmaku,
        huyaDanmaku,
        createWindow: (source) => openSecondaryWindow(source),
      });

      mainWindow = createAppWindow();
      hasCreatedMainWindow = true;
      mainWindow.on('closed', () => {
        mainWindow = null;
      });

      app.on('activate', () => {
        if (appWindows.size === 0) {
          mainWindow = createAppWindow();
          mainWindow.on('closed', () => {
            mainWindow = null;
          });
        }
      });

      logger.info('app.ready');
    })
    .catch((error: unknown) => {
      process.stderr.write(
        `${JSON.stringify({
          level: 'error',
          event: 'app.start.failed',
          message: error instanceof Error ? error.message : String(error),
        })}\n`,
      );
      app.quit();
    });

  app.on('window-all-closed', () => {
    if (!hasCreatedMainWindow) return;
    // A destroy from the temporary migration window can queue this event after
    // the real window has already been created.
    if (BrowserWindow.getAllWindows().length > 0) return;
    if (process.platform !== 'darwin') app.quit();
  });
}
