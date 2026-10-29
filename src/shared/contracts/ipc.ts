import type { AccountHealth, AccountSummary } from './account';
import type { RoomAudienceInput, RoomAudienceSnapshot } from './audience';
import type { RoomPkSnapshot } from './pk';
import type { BilibiliDanmakuConfig, DouyuDanmakuConfig, HuyaDanmakuUpdate } from './danmaku';
import type { RoomHistoryEntry } from './history';
import type { FollowedRoom } from './follow';
import type { SpecialFollowEntry, SpecialFollowTarget } from './specialFollow';
import type { GuidedPlatform, PlatformLoginStatus } from './platformLogin';
import type { ResolveStreamInput, StreamPlayback } from './stream';
import type { Result } from './result';
import type { WindowMode, LiveReminderSettings } from './viewing';
import type {
  RunTaskInput,
  TaskDescriptor,
  TaskProgressEvent,
  TaskRunResult,
  TaskRunSnapshot,
} from './task';

export interface DesktopApi {
  accounts: {
    list(): Promise<Result<AccountSummary[]>>;
    login(): Promise<Result<AccountSummary>>;
    switch(accountId: string): Promise<Result<void>>;
    logout(accountId: string): Promise<Result<void>>;
    health(accountId: string): Promise<Result<AccountHealth>>;
  };
  platforms: {
    status(platform: GuidedPlatform): Promise<Result<PlatformLoginStatus>>;
    login(platform: GuidedPlatform): Promise<Result<PlatformLoginStatus>>;
    logout(platform: GuidedPlatform): Promise<Result<void>>;
  };
  history: {
    load(): Promise<Result<RoomHistoryEntry[]>>;
    merge(entries: RoomHistoryEntry[]): Promise<Result<RoomHistoryEntry[]>>;
    remove(keys: string[]): Promise<Result<RoomHistoryEntry[]>>;
    clear(): Promise<Result<RoomHistoryEntry[]>>;
    onChange(listener: (entries: RoomHistoryEntry[]) => void): () => void;
  };
  home: {
    followed(): Promise<Result<FollowedRoom[]>>;
    reminderSettings(): Promise<Result<LiveReminderSettings & { supported: boolean }>>;
    setReminders(
      settings: LiveReminderSettings,
    ): Promise<Result<LiveReminderSettings & { supported: boolean }>>;
    onOpenRoom(listener: (roomId: string) => void): () => void;
    onReminderChange(
      listener: (settings: LiveReminderSettings & { supported: boolean }) => void,
    ): () => void;
  };
  special: {
    load(): Promise<Result<SpecialFollowEntry[]>>;
    toggle(target: SpecialFollowTarget): Promise<Result<SpecialFollowEntry[]>>;
    onChange(listener: (entries: SpecialFollowEntry[]) => void): () => void;
  };
  streams: {
    resolve(input: ResolveStreamInput): Promise<Result<StreamPlayback>>;
    audience(input: RoomAudienceInput): Promise<Result<RoomAudienceSnapshot>>;
    pk(roomId: string): Promise<Result<RoomPkSnapshot | null>>;
  };
  danmaku: {
    bilibiliConfig(roomId: string): Promise<Result<BilibiliDanmakuConfig>>;
    douyuConfig(): Promise<Result<DouyuDanmakuConfig>>;
    huyaStart(roomId: string): Promise<Result<string>>;
    huyaStop(subscriptionId: string): Promise<Result<void>>;
    onHuyaUpdate(listener: (update: HuyaDanmakuUpdate) => void): () => void;
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
    openNew(): void;
    mode(): Promise<WindowMode>;
    setMode(patch: Partial<WindowMode>): Promise<WindowMode>;
    onModeChange(listener: (mode: WindowMode) => void): () => void;
    onMaximizedChange(listener: (maximized: boolean) => void): () => void;
  };
}

export const IPC = {
  accountsList: 'accounts:list',
  accountsLogin: 'accounts:login',
  accountsSwitch: 'accounts:switch',
  accountsLogout: 'accounts:logout',
  accountsHealth: 'accounts:health',
  platformsStatus: 'platforms:status',
  platformsLogin: 'platforms:login',
  platformsLogout: 'platforms:logout',
  historyLoad: 'history:load',
  historyMerge: 'history:merge',
  historyRemove: 'history:remove',
  historyClear: 'history:clear',
  historyChanged: 'history:changed',
  homeFollowed: 'home:followed',
  homeReminderSettings: 'home:reminder-settings',
  homeSetReminders: 'home:set-reminders',
  homeOpenRoom: 'home:open-room',
  homeReminderChanged: 'home:reminder-changed',
  specialLoad: 'special:load',
  specialToggle: 'special:toggle',
  specialChanged: 'special:changed',
  streamsResolve: 'streams:resolve',
  streamsAudience: 'streams:audience',
  streamsPk: 'streams:pk',
  danmakuBilibiliConfig: 'danmaku:bilibili-config',
  danmakuDouyuConfig: 'danmaku:douyu-config',
  danmakuHuyaStart: 'danmaku:huya-start',
  danmakuHuyaStop: 'danmaku:huya-stop',
  danmakuHuyaUpdate: 'danmaku:huya-update',
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
  windowOpenNew: 'window:open-new',
  windowMode: 'window:mode',
  windowSetMode: 'window:set-mode',
  windowModeChanged: 'window:mode-changed',
  windowMaximizedChange: 'window:maximized-change',
} as const;
