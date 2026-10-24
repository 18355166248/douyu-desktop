import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '@shared/contracts/ipc';
import type { DesktopApi } from '@shared/contracts/ipc';
import type { TaskProgressEvent } from '@shared/contracts/task';

const api: DesktopApi = {
  accounts: {
    list: () => ipcRenderer.invoke(IPC.accountsList),
    login: () => ipcRenderer.invoke(IPC.accountsLogin),
    switch: (accountId) => ipcRenderer.invoke(IPC.accountsSwitch, accountId),
    logout: (accountId) => ipcRenderer.invoke(IPC.accountsLogout, accountId),
    health: (accountId) => ipcRenderer.invoke(IPC.accountsHealth, accountId),
  },
  streams: {
    resolve: (input) => ipcRenderer.invoke(IPC.streamsResolve, input),
  },
  tasks: {
    list: () => ipcRenderer.invoke(IPC.tasksList),
    run: (input) => ipcRenderer.invoke(IPC.tasksRun, input),
    onProgress: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: TaskProgressEvent): void => {
        listener(progress);
      };
      ipcRenderer.on(IPC.tasksProgress, handler);
      return () => {
        ipcRenderer.removeListener(IPC.tasksProgress, handler);
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
