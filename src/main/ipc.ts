import { BrowserWindow, ipcMain, shell } from 'electron';
import { z } from 'zod';
import { IPC } from '@shared/contracts/ipc';
import { MAX_ROOM_HISTORY } from '@shared/contracts/history';
import type { AppErrorPayload, Result } from '@shared/contracts/result';
import { fail, ok } from '@shared/contracts/result';
import { AppError, toAppError } from '@core/errors';
import type { JsonRoomHistoryStore } from './adapters/storage/JsonRoomHistoryStore';
import { isAllowedExternalUrl } from './constants';
import type { AccountSessionManager } from './services/AccountSessionManager';
import type { DouyuDanmakuSession } from './services/DouyuDanmakuSession';
import type { HuyaDanmakuSession } from './services/HuyaDanmakuSession';
import type { PlatformLoginManager } from './services/PlatformLoginManager';
import type { StreamService } from './services/StreamService';
import type { TaskService } from './services/TaskService';

const resolveStreamSchema = z.object({
  roomId: z.string().trim().min(1).max(32),
  platform: z.enum(['douyu', 'bilibili', 'huya']).optional(),
  quality: z.enum(['0', '3', '4', '8', '80', '150', '250', '400', '10000', '2000']).optional(),
  preferHls: z.boolean().optional(),
});

const roomAudienceSchema = z.object({
  roomId: z.string().trim().min(1).max(32),
  platform: z.enum(['douyu', 'bilibili', 'huya']),
});

const runTaskSchema = z.object({
  taskId: z.string().min(1),
  options: z.record(z.string(), z.unknown()).optional(),
  dryRun: z.boolean().optional(),
  confirmed: z.boolean().optional(),
});

const accountIdSchema = z.string().min(1);
const platformLoginSchema = z.enum(['bilibili', 'huya']);
const huyaRoomIdSchema = z.string().trim().min(1).max(32);
const huyaSubscriptionSchema = z.string().uuid();
const historyKeysSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^(douyu|bilibili|huya):.+$/),
  )
  .max(MAX_ROOM_HISTORY);

function toPayload(error: unknown): AppErrorPayload {
  if (error instanceof z.ZodError) {
    return {
      code: 'INVALID_INPUT',
      message: '参数不合法',
      retryable: false,
      details: {
        issues: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    };
  }
  return toAppError(error).toPayload();
}

async function respond<T>(action: () => Promise<T> | T): Promise<Result<T>> {
  try {
    return ok(await action());
  } catch (error) {
    return fail(toPayload(error));
  }
}

function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed() || window.webContents.isDestroyed()) continue;
    try {
      window.webContents.send(channel, payload);
    } catch {
      // The window may close between the check and send.
    }
  }
}

export interface IpcServices {
  accounts: AccountSessionManager;
  platforms: PlatformLoginManager;
  streams: StreamService;
  tasks: TaskService;
  history: JsonRoomHistoryStore;
  douyuDanmaku: DouyuDanmakuSession;
  huyaDanmaku: HuyaDanmakuSession;
  createWindow?: (source: BrowserWindow | null) => void;
}

export function registerIpcHandlers(services: IpcServices): void {
  const { accounts, platforms, streams, tasks, history, douyuDanmaku, huyaDanmaku } = services;

  ipcMain.on(IPC.windowMinimize, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  ipcMain.on(IPC.windowClose, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  ipcMain.on(IPC.windowOpenNew, (event) => {
    services.createWindow?.(BrowserWindow.fromWebContents(event.sender));
  });

  ipcMain.handle(IPC.windowToggleMaximize, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window.isDestroyed()) return false;
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
    return window.isMaximized();
  });

  ipcMain.handle(IPC.windowIsMaximized, (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false;
  });

  ipcMain.handle(IPC.accountsList, () => respond(() => accounts.list()));

  ipcMain.handle(IPC.accountsLogin, () => respond(() => accounts.login()));

  ipcMain.handle(IPC.accountsSwitch, (_event, rawAccountId: unknown) =>
    respond(async () => {
      const accountId = accountIdSchema.parse(rawAccountId);
      await accounts.switchAccount(accountId);
    }),
  );

  ipcMain.handle(IPC.accountsLogout, (_event, rawAccountId: unknown) =>
    respond(async () => {
      const accountId = accountIdSchema.parse(rawAccountId);
      await accounts.logout(accountId);
    }),
  );

  ipcMain.handle(IPC.accountsHealth, (_event, rawAccountId: unknown) =>
    respond(async () => {
      const accountId = accountIdSchema.parse(rawAccountId);
      return accounts.health(accountId);
    }),
  );

  ipcMain.handle(IPC.platformsStatus, (_event, rawPlatform: unknown) =>
    respond(async () => {
      const platform = platformLoginSchema.parse(rawPlatform);
      return platforms.status(platform);
    }),
  );

  ipcMain.handle(IPC.platformsLogin, (_event, rawPlatform: unknown) =>
    respond(async () => {
      const platform = platformLoginSchema.parse(rawPlatform);
      return platforms.login(platform);
    }),
  );

  ipcMain.handle(IPC.platformsLogout, (_event, rawPlatform: unknown) =>
    respond(async () => {
      const platform = platformLoginSchema.parse(rawPlatform);
      await platforms.logout(platform);
    }),
  );

  ipcMain.handle(IPC.streamsResolve, (_event, rawInput: unknown) =>
    respond(async () => {
      const input = resolveStreamSchema.parse(rawInput);
      return streams.resolve(input);
    }),
  );

  ipcMain.handle(IPC.historyLoad, () => respond(() => history.load()));

  ipcMain.handle(IPC.historyMerge, (_event, rawEntries: unknown) =>
    respond(async () => {
      const entries = await history.merge(rawEntries);
      broadcast(IPC.historyChanged, entries);
      return entries;
    }),
  );

  ipcMain.handle(IPC.historyRemove, (_event, rawKeys: unknown) =>
    respond(async () => {
      const keys = historyKeysSchema.parse(rawKeys);
      const entries = await history.remove(keys);
      broadcast(IPC.historyChanged, entries);
      return entries;
    }),
  );

  ipcMain.handle(IPC.historyClear, () =>
    respond(async () => {
      const entries = await history.clear();
      broadcast(IPC.historyChanged, entries);
      return entries;
    }),
  );

  ipcMain.handle(IPC.streamsAudience, (_event, rawInput: unknown) =>
    respond(() => streams.audience(roomAudienceSchema.parse(rawInput))),
  );

  ipcMain.handle(IPC.danmakuBilibiliConfig, (_event, rawRoomId: unknown) =>
    respond(async () => {
      const roomId = z.string().trim().min(1).max(32).parse(rawRoomId);
      return streams.bilibiliDanmakuConfig(roomId);
    }),
  );

  ipcMain.handle(IPC.danmakuDouyuConfig, () => respond(() => douyuDanmaku.prepare()));

  ipcMain.handle(IPC.danmakuHuyaStart, (event, rawRoomId: unknown) =>
    respond(() => {
      const roomId = huyaRoomIdSchema.parse(rawRoomId);
      return huyaDanmaku.start(roomId, event.sender);
    }),
  );

  ipcMain.handle(IPC.danmakuHuyaStop, (_event, rawSubscriptionId: unknown) =>
    respond(() => {
      const subscriptionId = huyaSubscriptionSchema.parse(rawSubscriptionId);
      huyaDanmaku.stop(subscriptionId);
    }),
  );

  ipcMain.handle(IPC.tasksList, () => respond(() => tasks.list()));

  ipcMain.handle(IPC.tasksStatus, () => respond(() => tasks.status()));

  ipcMain.handle(IPC.tasksRun, (_event, rawInput: unknown) => {
    const run = respond(async () => {
      const input = runTaskSchema.parse(rawInput);
      return tasks.run(input, (progress) => broadcast(IPC.tasksProgress, progress));
    });
    broadcast(IPC.tasksState, tasks.status());
    void run.then(() => broadcast(IPC.tasksState, tasks.status()));
    return run;
  });

  ipcMain.handle(IPC.appOpenExternal, (_event, rawUrl: unknown) =>
    respond(async () => {
      const url = z.string().min(1).parse(rawUrl);
      if (!isAllowedExternalUrl(url)) {
        throw new AppError('INVALID_INPUT', '不允许打开此链接');
      }
      await shell.openExternal(url);
    }),
  );
}
