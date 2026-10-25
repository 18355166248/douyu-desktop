import type { AccountHealth, AccountSummary } from './account';
import type { BilibiliDanmakuConfig, DouyuDanmakuConfig } from './danmaku';
import type { ResolveStreamInput, StreamPlayback } from './stream';
import type { Result } from './result';
import type { RunTaskInput, TaskDescriptor, TaskProgressEvent, TaskRunResult, TaskRunSnapshot } from './task';

export interface DesktopApi {
  accounts: {
    list(): Promise<Result<AccountSummary[]>>;
    login(): Promise<Result<AccountSummary>>;
    switch(accountId: string): Promise<Result<void>>;
    logout(accountId: string): Promise<Result<void>>;
    health(accountId: string): Promise<Result<AccountHealth>>;
  };
  streams: {
    resolve(input: ResolveStreamInput): Promise<Result<StreamPlayback>>;
  };
  danmaku: {
    bilibiliConfig(roomId: string): Promise<Result<BilibiliDanmakuConfig>>;
    douyuConfig(): Promise<Result<DouyuDanmakuConfig>>;
  };
  tasks: {
    list(): Promise<Result<TaskDescriptor[]>>;
    run(input: RunTaskInput): Promise<Result<TaskRunResult>>;
    status(): Promise<Result<TaskRunSnapshot | null>>;
    onProgress(listener: (event: TaskProgressEvent) => void): () => void;
    onState(listener: (state: TaskRunSnapshot | null) => void): () => void;
  };
  app: {
    openExternal(url: string): Promise<Result<void>>;
  };
  window: {
    minimize(): void;
    toggleMaximize(): Promise<boolean>;
    close(): void;
    isMaximized(): Promise<boolean>;
    onMaximizedChange(listener: (maximized: boolean) => void): () => void;
  };
}

export const IPC = {
  accountsList: 'accounts:list',
  accountsLogin: 'accounts:login',
  accountsSwitch: 'accounts:switch',
  accountsLogout: 'accounts:logout',
  accountsHealth: 'accounts:health',
  streamsResolve: 'streams:resolve',
  danmakuBilibiliConfig: 'danmaku:bilibili-config',
  danmakuDouyuConfig: 'danmaku:douyu-config',
  tasksList: 'tasks:list',
  tasksRun: 'tasks:run',
  tasksStatus: 'tasks:status',
  tasksProgress: 'tasks:progress',
  tasksState: 'tasks:state',
  appOpenExternal: 'app:open-external',
  windowMinimize: 'window:minimize',
  windowToggleMaximize: 'window:toggle-maximize',
  windowClose: 'window:close',
  windowIsMaximized: 'window:is-maximized',
  windowMaximizedChange: 'window:maximized-change',
} as const;
