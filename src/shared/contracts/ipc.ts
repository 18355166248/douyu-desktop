import type { AccountHealth, AccountSummary } from './account';
import type { ResolveStreamInput, StreamPlayback } from './stream';
import type { Result } from './result';
import type { RunTaskInput, TaskDescriptor, TaskProgressEvent, TaskRunResult } from './task';

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
  tasks: {
    list(): Promise<Result<TaskDescriptor[]>>;
    run(input: RunTaskInput): Promise<Result<TaskRunResult>>;
    onProgress(listener: (event: TaskProgressEvent) => void): () => void;
  };
  app: {
    openExternal(url: string): Promise<Result<void>>;
  };
}

export const IPC = {
  accountsList: 'accounts:list',
  accountsLogin: 'accounts:login',
  accountsSwitch: 'accounts:switch',
  accountsLogout: 'accounts:logout',
  accountsHealth: 'accounts:health',
  streamsResolve: 'streams:resolve',
  tasksList: 'tasks:list',
  tasksRun: 'tasks:run',
  tasksProgress: 'tasks:progress',
  appOpenExternal: 'app:open-external',
} as const;
