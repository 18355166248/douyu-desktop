import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '@shared/contracts/ipc';
import type { DesktopApi } from '@shared/contracts/ipc';
import type { HuyaDanmakuUpdate } from '@shared/contracts/danmaku';
import type { TaskProgressEvent, TaskRunSnapshot } from '@shared/contracts/task';

const api: DesktopApi = {
  accounts: {
    list: () => ipcRenderer.invoke(IPC.accountsList),
    login: () => ipcRenderer.invoke(IPC.accountsLogin),
    switch: (accountId) => ipcRenderer.invoke(IPC.accountsSwitch, accountId),
    logout: (accountId) => ipcRenderer.invoke(IPC.accountsLogout, accountId),
    health: (accountId) => ipcRenderer.invoke(IPC.accountsHealth, accountId),
  },
  platforms: {
    status: (platform) => ipcRenderer.invoke(IPC.platformsStatus, platform),
    login: (platform) => ipcRenderer.invoke(IPC.platformsLogin, platform),
    logout: (platform) => ipcRenderer.invoke(IPC.platformsLogout, platform),
  },
  streams: {
    resolve: (input) => ipcRenderer.invoke(IPC.streamsResolve, input),
    audience: (input) => ipcRenderer.invoke(IPC.streamsAudience, input),
  },
  danmaku: {
    bilibiliConfig: (roomId) => ipcRenderer.invoke(IPC.danmakuBilibiliConfig, roomId),
    douyuConfig: () => ipcRenderer.invoke(IPC.danmakuDouyuConfig),
    huyaStart: (roomId) => ipcRenderer.invoke(IPC.danmakuHuyaStart, roomId),
    huyaStop: (subscriptionId) => ipcRenderer.invoke(IPC.danmakuHuyaStop, subscriptionId),
    onHuyaUpdate: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, update: HuyaDanmakuUpdate): void => {
        listener(update);
      };
      ipcRenderer.on(IPC.danmakuHuyaUpdate, handler);
      return () => {
        ipcRenderer.removeListener(IPC.danmakuHuyaUpdate, handler);
      };
    },
  },
  tasks: {
    list: () => ipcRenderer.invoke(IPC.tasksList),
    run: (input) => ipcRenderer.invoke(IPC.tasksRun, input),
    status: () => ipcRenderer.invoke(IPC.tasksStatus),
    onProgress: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: TaskProgressEvent): void => {
        listener(progress);
      };
      ipcRenderer.on(IPC.tasksProgress, handler);
      return () => {
        ipcRenderer.removeListener(IPC.tasksProgress, handler);
      };
    },
    onState: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, state: TaskRunSnapshot | null): void => {
        listener(state);
      };
      ipcRenderer.on(IPC.tasksState, handler);
      return () => {
        ipcRenderer.removeListener(IPC.tasksState, handler);
      };
    },
  },
  app: {
    openExternal: (url) => ipcRenderer.invoke(IPC.appOpenExternal, url),
  },
  window: {
    minimize: () => ipcRenderer.send(IPC.windowMinimize),
    toggleMaximize: () => ipcRenderer.invoke(IPC.windowToggleMaximize),
    close: () => ipcRenderer.send(IPC.windowClose),
    isMaximized: () => ipcRenderer.invoke(IPC.windowIsMaximized),
    onMaximizedChange: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, maximized: boolean): void => {
        listener(maximized);
      };
      ipcRenderer.on(IPC.windowMaximizedChange, handler);
      return () => {
        ipcRenderer.removeListener(IPC.windowMaximizedChange, handler);
      };
    },
  },
};

contextBridge.exposeInMainWorld('api', api);
