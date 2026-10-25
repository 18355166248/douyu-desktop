import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
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
import { registerIpcHandlers } from './ipc';
import { createMainWindow } from './window';

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let mainWindow: BrowserWindow | null = null;

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
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
      });

      mainWindow = createMainWindow();
      mainWindow.on('closed', () => {
        mainWindow = null;
      });

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          mainWindow = createMainWindow();
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
    if (process.platform !== 'darwin') app.quit();
  });
}
