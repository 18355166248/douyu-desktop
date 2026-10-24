import { BrowserWindow, ipcMain, shell } from 'electron';
import { z } from 'zod';
import { IPC } from '@shared/contracts/ipc';
import type { AppErrorPayload, Result } from '@shared/contracts/result';
import { fail, ok } from '@shared/contracts/result';
import { AppError, toAppError } from '@core/errors';
import { isAllowedExternalUrl } from './constants';
import type { AccountSessionManager } from './services/AccountSessionManager';
import type { StreamService } from './services/StreamService';
import type { TaskService } from './services/TaskService';

const resolveStreamSchema = z.object({
  roomId: z.string().trim().min(1).max(32),
  quality: z.enum(['0', '3', '4', '8']).optional(),
  preferHls: z.boolean().optional(),
});

const runTaskSchema = z.object({
  taskId: z.string().min(1),
  options: z.record(z.string(), z.unknown()).optional(),
  dryRun: z.boolean().optional(),
  confirmed: z.boolean().optional(),
});

const accountIdSchema = z.string().min(1);

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

export interface IpcServices {
  accounts: AccountSessionManager;
  streams: StreamService;
  tasks: TaskService;
}

export function registerIpcHandlers(services: IpcServices): void {
  const { accounts, streams, tasks } = services;

  ipcMain.on(IPC.windowMinimize, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  ipcMain.on(IPC.windowClose, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
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

  ipcMain.handle(IPC.streamsResolve, (_event, rawInput: unknown) =>
    respond(async () => {
      const input = resolveStreamSchema.parse(rawInput);
      return streams.resolve(input);
    }),
  );

  ipcMain.handle(IPC.tasksList, () => respond(() => tasks.list()));

  ipcMain.handle(IPC.tasksRun, (event, rawInput: unknown) =>
    respond(async () => {
      const input = runTaskSchema.parse(rawInput);
      return tasks.run(input, (progress) => {
        if (!event.sender.isDestroyed()) event.sender.send(IPC.tasksProgress, progress);
      });
    }),
  );

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
