import { useCallback, useEffect, useRef, useState } from 'react';
import type { StreamPlatform } from '@shared/contracts/stream';
import { Icon } from './components/Icon';
import { PlatformPicker } from './components/PlatformPicker';
import { TitleBar } from './components/TitleBar';
import { AccountBar } from './features/accounts/AccountBar';
import { useAccounts } from './features/accounts/useAccounts';
import { DanmakuSettingsPanel } from './features/danmaku/DanmakuSettingsPanel';
import { RoomHistoryPanel } from './features/history/RoomHistoryPanel';
import { useRoomHistory } from './features/history/useRoomHistory';
import type { RoomHistoryEntry } from './features/history/roomHistory';
import { HomePage } from './features/home/HomePage';
import { useFollowedRooms } from './features/home/useFollowedRooms';
import { useSpecialFollows } from './features/home/useSpecialFollows';
import { EmptyStage } from './features/player/EmptyStage';
import { StreamGrid } from './features/player/StreamGrid';
import {
  MAX_STREAMS,
  canAddStream,
  loadStreamLayoutMode,
  saveStreamLayoutMode,
} from './features/player/streamGridLayout';
import type { StreamLayoutMode } from './features/player/streamGridLayout';
import {
  ADD_CANCELLED,
  defaultStreamOptions,
  useStreamGrid,
} from './features/player/useStreamGrid';
import { parseRoomInput } from './features/player/roomInput';
import {
  getRoomPreference,
  clearLastViewing,
  loadLastViewing,
  readStored,
  saveLastViewing,
  writeStored,
} from './features/player/viewingStorage';
import type { ViewingScene } from './features/player/viewingStorage';
import { ViewingScenesPanel } from './features/player/ViewingScenesPanel';
import { ReplaceRoomPanel } from './features/player/ReplaceRoomPanel';
import type { StreamResolveOptions } from './features/player/useStreamGrid';
import { isEditableTarget } from './lib/keyboard';
import { platformLabel, roomKey, streamKey } from './lib/streamIdentity';
import { useDismissableLayer } from './lib/useDismissableLayer';
import { AutoSignRunner } from './features/tasks/AutoSignRunner';
import { TaskButton } from './features/tasks/TaskButton';
import { TaskPanel } from './features/tasks/TaskPanel';

function roomPlaceholder(platform: StreamPlatform): string {
  if (platform === 'bilibili') return 'B站房间号，如 6';
  if (platform === 'huya') return '虎牙房间号，如 11342412';
  return '房间号，如 9999';
}

const IMMERSIVE_EXIT_HIDE_MS = 4000;
const isSecondaryWindow = new URLSearchParams(window.location.search).get('role') === 'secondary';
type WorkspaceView = 'home' | 'live';

export function App(): React.JSX.Element {
  const { activeAccount, query: accountsQuery } = useAccounts();
  const {
    streams,
    isAdding,
    reloadingKeys,
    mutedRooms,
    volumes,
    soloKey,
    addStream,
    reloadStream,
    setStreamOptions,
    removeStream,
    clearStreams,
    toggleMute,
    toggleSolo,
    setVolume,
    moveStream,
    replaceStream,
  } = useStreamGrid();
  const [platform, setPlatform] = useState<StreamPlatform>('douyu');
  const [roomId, setRoomId] = useState('9999');
  const [activeView, setActiveView] = useState<WorkspaceView>('home');
  const [layoutMode, setLayoutMode] = useState<StreamLayoutMode>(() => loadStreamLayoutMode());
  const [mainStreamKey, setMainStreamKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDanmakuSettingsOpen, setDanmakuSettingsOpen] = useState(false);
  const [isHistoryOpen, setHistoryOpen] = useState(false);
  const [isTaskOpen, setTaskOpen] = useState(false);
  const [isHomeRefreshing, setHomeRefreshing] = useState(false);
  const [isImmersive, setImmersive] = useState(false);
  const [isImmersiveExitVisible, setImmersiveExitVisible] = useState(false);
  const [scenesOpen, setScenesOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [replaceKey, setReplaceKey] = useState<string | null>(null);
  const [lastViewing, setLastViewing] = useState(loadLastViewing);
  const [autoRestore, setAutoRestore] = useState(
    () => readStored('douyu-desktop.auto-restore.v1') === true,
  );
  const restoreToken = useRef(0);
  const attemptedRestore = useRef(false);
  const roomInputRef = useRef<HTMLInputElement>(null);
  const danmakuSettingsRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const homeRefreshRef = useRef(false);
  const immersiveExitTimerRef = useRef<number | null>(null);
  const {
    entries: roomHistory,
    reload: reloadHistory,
    recordVisit,
    removeHistory,
    clearHistory,
  } = useRoomHistory();
  const followed = useFollowedRooms(activeAccount?.id ?? null, activeAccount?.status === 'active');
  const special = useSpecialFollows();
  const reloadFollowed = followed.reload;
  const reloadSpecial = special.reload;
  const homeUpdatedAt = useRef(0);
  homeUpdatedAt.current = followed.updatedAt;
  useEffect(() => {
    if (
      activeView === 'home' &&
      homeUpdatedAt.current > 0 &&
      Date.now() - homeUpdatedAt.current > 60_000
    )
      void reloadFollowed();
  }, [activeView, reloadFollowed]);
  const refreshHome = useCallback(async (): Promise<void> => {
    if (homeRefreshRef.current) return;
    homeRefreshRef.current = true;
    setHomeRefreshing(true);
    try {
      await Promise.all([reloadFollowed(), reloadSpecial(), reloadHistory()]);
    } catch (reason) {
      console.warn('[home] 刷新首页失败', reason);
    } finally {
      homeRefreshRef.current = false;
      setHomeRefreshing(false);
    }
  }, [reloadFollowed, reloadHistory, reloadSpecial]);
  const historyCovers = new Map<string, string>();
  for (const room of [...followed.rooms, ...special.entries]) {
    if (room.cover) historyCovers.set(roomKey(room.platform, room.roomId), room.cover);
  }

  useDismissableLayer({
    open: isDanmakuSettingsOpen,
    onClose: () => setDanmakuSettingsOpen(false),
    layerRef: danmakuSettingsRef,
  });
  useDismissableLayer({
    open: isHistoryOpen,
    onClose: () => setHistoryOpen(false),
    layerRef: historyRef,
  });
  useDismissableLayer({
    open: isTaskOpen,
    onClose: () => setTaskOpen(false),
    closeOnPointerDown: false,
  });

  const clearImmersiveExitTimer = useCallback((): void => {
    if (immersiveExitTimerRef.current !== null) {
      window.clearTimeout(immersiveExitTimerRef.current);
      immersiveExitTimerRef.current = null;
    }
  }, []);

  const hideImmersiveExit = useCallback((): void => {
    clearImmersiveExitTimer();
    setImmersiveExitVisible(false);
  }, [clearImmersiveExitTimer]);

  const showImmersiveExit = useCallback((): void => {
    setImmersiveExitVisible(true);
    clearImmersiveExitTimer();
    immersiveExitTimerRef.current = window.setTimeout(() => {
      immersiveExitTimerRef.current = null;
      setImmersiveExitVisible(false);
    }, IMMERSIVE_EXIT_HIDE_MS);
  }, [clearImmersiveExitTimer]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (scenesOpen || replaceKey || isTaskOpen || isHistoryOpen || isDanmakuSettingsOpen) return;
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        !event.repeat &&
        event.key.toLowerCase() === 'n'
      ) {
        event.preventDefault();
        window.api.window.openNew();
        return;
      }
      if (event.key === 'Escape') {
        if (document.querySelector('.room-context-menu')) return;
        setImmersive(false);
        return;
      }
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.isComposing ||
        isEditableTarget(event.target)
      ) {
        return;
      }
      if (event.key.toLowerCase() !== 'f' || streams.length === 0) return;

      event.preventDefault();
      setHistoryOpen(false);
      setTaskOpen(false);
      setDanmakuSettingsOpen(false);
      setActiveView('live');
      setImmersive((value) => !value);
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [streams.length, scenesOpen, replaceKey, isTaskOpen, isHistoryOpen, isDanmakuSettingsOpen]);

  useEffect(() => {
    if (isImmersive && streams.length === 0) setImmersive(false);
  }, [isImmersive, streams.length]);

  useEffect(() => {
    if (!isImmersive) {
      hideImmersiveExit();
      return undefined;
    }

    showImmersiveExit();
    return clearImmersiveExitTimer;
  }, [clearImmersiveExitTimer, hideImmersiveExit, isImmersive, showImmersiveExit]);

  const canAdd = canAddStream(streams.length);
  const canSubmit = canAdd && roomId.trim().length > 0;
  const effectiveMainKey = streams.some(
    (entry) => mainStreamKey !== null && streamKey(entry.playback) === mainStreamKey,
  )
    ? mainStreamKey
    : streams[0]
      ? streamKey(streams[0].playback)
      : null;

  useEffect(() => {
    saveStreamLayoutMode(layoutMode);
  }, [layoutMode]);

  async function handleAdd(targetPlatform: StreamPlatform, targetRoomId: string): Promise<void> {
    setError(null);
    if (restoring) return;
    let target;
    try {
      target = parseRoomInput(targetRoomId, targetPlatform);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '直播间链接不合法');
      return;
    }
    setPlatform(target.platform);
    const preference = getRoomPreference(target.platform, target.roomId);
    const message = await addStream(
      {
        ...defaultStreamOptions(target.platform),
        ...(preference ?? {}),
        ...target,
      },
      (playback) => {
        recordVisit({
          platform: playback.platform,
          roomId: playback.roomId,
          title: playback.title,
          anchorName: playback.anchorName,
          ...(playback.cover ? { cover: playback.cover } : {}),
        });
      },
    );
    if (message) {
      if (message === ADD_CANCELLED) return;
      setError(message);
      return;
    }
    setActiveView('live');
    setRoomId('');
    focusRoomInput();
  }

  function handleRoomQuickOpen(targetPlatform: StreamPlatform, targetRoomId: string): void {
    setError(null);
    if (
      streams.some((entry) => streamKey(entry.playback) === roomKey(targetPlatform, targetRoomId))
    ) {
      setActiveView('live');
      return;
    }
    void handleAdd(targetPlatform, targetRoomId);
  }
  const notificationOpenRef = useRef(handleRoomQuickOpen);
  notificationOpenRef.current = handleRoomQuickOpen;
  useEffect(
    () => window.api.home.onOpenRoom((room) => notificationOpenRef.current('douyu', room)),
    [],
  );

  function handleClearStreams(): void {
    clearLastViewing();
    setLastViewing(null);
    setReplaceKey(null);
    restoreToken.current += 1;
    setRestoring(false);
    clearStreams();
    setActiveView('home');
  }

  function handleRemoveStream(key: string): void {
    const isLast = streams.length === 1;
    removeStream(key);
    if (isLast) {
      clearLastViewing();
      setLastViewing(null);
      setActiveView('home');
    }
  }

  function handleHistorySelect(entry: RoomHistoryEntry): void {
    setHistoryOpen(false);
    setPlatform(entry.platform);
    setRoomId(entry.roomId);
    void handleAdd(entry.platform, entry.roomId);
  }

  function handleReload(key: string): void {
    void reloadStream(key).then((message) => {
      if (message) setError(message);
    });
  }

  function enterImmersive(): void {
    if (streams.length === 0) return;
    setHistoryOpen(false);
    setTaskOpen(false);
    setDanmakuSettingsOpen(false);
    setActiveView('live');
    setImmersive(true);
  }

  function toggleImmersive(): void {
    if (isImmersive) {
      setImmersive(false);
      return;
    }
    enterImmersive();
  }

  function handleStreamOptionsChange(key: string, patch: Partial<StreamResolveOptions>): void {
    void setStreamOptions(key, patch).then((message) => {
      if (message) setError(message);
    });
  }

  function focusRoomInput(): void {
    roomInputRef.current?.focus();
    roomInputRef.current?.select();
  }

  function addButtonLabel(): string {
    if (restoring) return '载入组合…';
    if (isAdding) return '解析中…';
    if (!canAdd) return `已满 ${MAX_STREAMS} 路`;
    return streams.length > 0 ? '添加' : '播放';
  }

  function addButtonIcon(): 'refresh' | 'plus' | 'play' {
    if (isAdding) return 'refresh';
    return streams.length > 0 ? 'plus' : 'play';
  }

  const currentViewing: ViewingScene | null = streams.length
    ? {
        id: 'last',
        name: '上次观看',
        layout: layoutMode,
        mainKey: effectiveMainKey,
        rooms: streams.map((entry) => ({
          platform: entry.playback.platform,
          roomId: entry.playback.roomId,
          ...entry.options,
          volume: volumes[streamKey(entry.playback)] ?? 1,
          muted: mutedRooms[streamKey(entry.playback)] === true,
        })),
      }
    : null;
  const viewingJson = JSON.stringify(currentViewing);
  useEffect(() => {
    if (restoring || viewingJson === 'null') return undefined;
    const persist = (): void => {
      const scene = JSON.parse(viewingJson) as ViewingScene;
      saveLastViewing(scene);
      setLastViewing(scene);
    };
    const timer = window.setTimeout(persist, 300);
    window.addEventListener('beforeunload', persist);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('beforeunload', persist);
    };
  }, [restoring, viewingJson]);

  async function restoreViewing(scene: ViewingScene): Promise<void> {
    const token = ++restoreToken.current;
    clearStreams();
    setRestoring(true);
    setScenesOpen(false);
    setError(null);
    setActiveView('live');
    setLayoutMode(scene.layout);
    setMainStreamKey(scene.mainKey);
    const failures: string[] = [];
    for (const room of scene.rooms) {
      if (token !== restoreToken.current) return;
      const message = await addStream(room, (playback) =>
        recordVisit({
          platform: playback.platform,
          roomId: playback.roomId,
          title: playback.title,
          anchorName: playback.anchorName,
          ...(playback.cover ? { cover: playback.cover } : {}),
        }),
      );
      if (message === ADD_CANCELLED || token !== restoreToken.current) return;
      if (message) failures.push(`${room.roomId}：${message}`);
    }
    setRestoring(false);
    if (failures.length) setError(`部分房间未能打开：${failures.join('；')}`);
  }
  const restoreViewingRef = useRef(restoreViewing);
  restoreViewingRef.current = restoreViewing;
  useEffect(() => {
    if (attemptedRestore.current) return;
    attemptedRestore.current = true;
    if (autoRestore && lastViewing && !isSecondaryWindow)
      void restoreViewingRef.current(lastViewing);
  }, [autoRestore, lastViewing]);

  return (
    <div
      className={`window-frame${isImmersive ? ' is-immersive' : ''}`}
      onPointerEnter={isImmersive ? showImmersiveExit : undefined}
      onPointerLeave={hideImmersiveExit}
      onPointerMove={isImmersive ? showImmersiveExit : undefined}
    >
      {isSecondaryWindow ? null : <AutoSignRunner account={activeAccount} />}
      <TitleBar>
        <div className="titlebar-tabs" role="tablist" aria-label="工作区视图">
          <button
            type="button"
            role="tab"
            id="home-tab"
            aria-selected={activeView === 'home'}
            aria-controls="home-view"
            className={`titlebar-tab${activeView === 'home' ? ' is-active' : ''}`}
            onClick={() => setActiveView('home')}
          >
            <Icon name="home" size={14} />
            <strong>首页</strong>
          </button>
          <button
            type="button"
            role="tab"
            id="live-tab"
            aria-selected={activeView === 'live'}
            aria-controls="live-view"
            className={`titlebar-tab${activeView === 'live' ? ' is-active' : ''}`}
            onClick={() => setActiveView('live')}
            aria-label={`${isSecondaryWindow ? '副屏' : '直播'}工作台，当前 ${streams.length} 路`}
          >
            <Icon name="live" size={14} />
            <strong>{isSecondaryWindow ? '副屏' : '直播'}</strong>
            <span className="titlebar-count">
              {streams.length}/{MAX_STREAMS}
            </span>
          </button>
          {activeView === 'live' && streams.length > 1 ? (
            <div className="layout-switch" role="group" aria-label="直播画面布局">
              <button
                type="button"
                className={layoutMode === 'even' ? 'is-active' : ''}
                aria-pressed={layoutMode === 'even'}
                onClick={() => setLayoutMode('even')}
                title="所有直播间等分屏幕"
              >
                均分
              </button>
              <button
                type="button"
                className={layoutMode === 'focus' ? 'is-active' : ''}
                aria-pressed={layoutMode === 'focus'}
                onClick={() => setLayoutMode('focus')}
                title="主直播间占大画面，其他直播间分剩余区域"
              >
                主画面
              </button>
            </div>
          ) : null}
        </div>

        <form
          className="titlebar-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) void handleAdd(platform, roomId);
          }}
        >
          <PlatformPicker value={platform} onChange={setPlatform} />

          <div className="room-field">
            <Icon name="live" size={15} />
            <input
              ref={roomInputRef}
              value={roomId}
              onChange={(event) => setRoomId(event.target.value)}
              placeholder={`${roomPlaceholder(platform)} / 直播间链接`}
              spellCheck={false}
              aria-label={`${platformLabel(platform)}房间号`}
            />
          </div>

          <div className="history-anchor" ref={historyRef}>
            <button
              type="button"
              className={`btn ghost titlebar-history${isHistoryOpen ? ' is-active' : ''}`}
              onClick={() => setHistoryOpen((open) => !open)}
              aria-expanded={isHistoryOpen}
              aria-haspopup="dialog"
              aria-controls="room-history-panel"
              title="查看访问过的房间"
            >
              <Icon name="history" size={14} />
              历史
            </button>
            {isHistoryOpen ? (
              <RoomHistoryPanel
                entries={roomHistory}
                coverByKey={historyCovers}
                onSelect={handleHistorySelect}
                onRemove={removeHistory}
                onClear={clearHistory}
                onClose={() => setHistoryOpen(false)}
              />
            ) : null}
          </div>

          <button
            type="submit"
            className="btn primary titlebar-add"
            disabled={restoring || isAdding || !canSubmit}
          >
            <Icon name={addButtonIcon()} size={15} />
            {addButtonLabel()}
          </button>

          {streams.length > 0 || isAdding || restoring ? (
            <button type="button" className="btn ghost titlebar-clear" onClick={handleClearStreams}>
              清空
            </button>
          ) : null}
        </form>

        <button
          type="button"
          className="btn ghost titlebar-scenes"
          onClick={() => setScenesOpen(true)}
        >
          组合
        </button>

        <button
          type="button"
          className="titlebar-new-window"
          onClick={() => window.api.window.openNew()}
          title="新建副屏窗口（Ctrl+N）"
          aria-label="新建副屏窗口"
          aria-keyshortcuts="Control+N"
        >
          <Icon name="grid" size={14} />
        </button>

        {streams.length > 0 ? (
          <button
            type="button"
            className="titlebar-immersive"
            onClick={enterImmersive}
            title="进入沉浸模式 (F)"
            aria-label="进入沉浸模式"
            aria-keyshortcuts="F"
          >
            <Icon name="expand" size={14} />
            <span>沉浸</span>
          </button>
        ) : null}

        <TaskButton open={isTaskOpen} onToggle={() => setTaskOpen((open) => !open)} />

        <AccountBar compact />
      </TitleBar>
      <div className="app-shell">
        <main className={`main${activeView === 'live' ? ' is-live' : ''}`}>
          {error ? (
            <div className="alert" role="alert">
              <Icon name="alert" size={18} />
              <span className="selectable">{error}</span>
              <button type="button" className="alert-close" onClick={() => setError(null)}>
                <Icon name="close" size={15} />
              </button>
            </div>
          ) : null}

          <div className="workspace">
            <section
              id="home-view"
              role="tabpanel"
              aria-labelledby="home-tab"
              className="workspace-view"
              hidden={activeView !== 'home'}
            >
              <HomePage
                accountsLoading={accountsQuery.isLoading}
                activeAccount={activeAccount}
                followed={followed.rooms}
                followedLoading={followed.loading}
                followedError={followed.error}
                history={roomHistory}
                specials={special.entries}
                specialError={special.error}
                refreshing={isHomeRefreshing}
                onRefreshHome={() => void refreshHome()}
                onOpen={handleRoomQuickOpen}
                onToggleSpecial={special.toggle}
                onRemoveHistory={removeHistory}
                onClearHistory={clearHistory}
              />
            </section>

            <section
              id="live-view"
              role="tabpanel"
              aria-labelledby="live-tab"
              className="workspace-view"
              hidden={activeView !== 'live'}
            >
              <div className="stage">
                {streams.length === 0 ? (
                  <EmptyStage
                    onPickExample={() => {
                      setPlatform('douyu');
                      setRoomId('9999');
                      void handleAdd('douyu', '9999');
                    }}
                  />
                ) : (
                  <StreamGrid
                    streams={streams}
                    layoutMode={layoutMode}
                    mainKey={effectiveMainKey}
                    immersive={isImmersive}
                    keyboardActive={
                      activeView === 'live' &&
                      !scenesOpen &&
                      !replaceKey &&
                      !isTaskOpen &&
                      !isHistoryOpen &&
                      !isDanmakuSettingsOpen
                    }
                    reloadingKeys={reloadingKeys}
                    mutedRooms={mutedRooms}
                    volumes={volumes}
                    soloKey={soloKey}
                    onReload={handleReload}
                    onOptionsChange={handleStreamOptionsChange}
                    onRemove={handleRemoveStream}
                    onSetMain={setMainStreamKey}
                    onToggleMute={toggleMute}
                    onToggleSolo={toggleSolo}
                    onVolumeChange={setVolume}
                    onOpenDanmakuSettings={() => setDanmakuSettingsOpen(true)}
                    onToggleImmersive={toggleImmersive}
                    onRequestAdd={focusRoomInput}
                    onMove={moveStream}
                    onReplace={setReplaceKey}
                  />
                )}
              </div>
            </section>
          </div>
        </main>
      </div>

      {isImmersive ? (
        <button
          type="button"
          className={`immersive-exit${isImmersiveExitVisible ? ' is-visible' : ''}`}
          onClick={() => setImmersive(false)}
          title="退出沉浸模式（Esc）"
          aria-label="退出沉浸模式"
          aria-keyshortcuts="Escape"
        >
          <Icon name="minimize" size={14} />
          <span>退出沉浸</span>
        </button>
      ) : null}

      {isTaskOpen ? (
        <div
          className="task-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="签到任务"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setTaskOpen(false);
          }}
        >
          <TaskPanel
            hasAccount={Boolean(activeAccount && activeAccount.status === 'active')}
            onClose={() => setTaskOpen(false)}
          />
        </div>
      ) : null}

      {scenesOpen ? (
        <ViewingScenesPanel
          current={currentViewing}
          last={lastViewing}
          busy={restoring || isAdding}
          autoRestore={autoRestore}
          onAutoRestore={(value) => {
            if (writeStored('douyu-desktop.auto-restore.v1', value)) setAutoRestore(value);
            else setError('无法保存自动恢复设置');
          }}
          onRestore={(scene) => void restoreViewing(scene)}
          onClose={() => setScenesOpen(false)}
        />
      ) : null}

      {replaceKey ? (
        <ReplaceRoomPanel
          platform={
            streams.find((entry) => streamKey(entry.playback) === replaceKey)?.playback.platform ??
            platform
          }
          onClose={() => setReplaceKey(null)}
          onReplace={async (input, selected) => {
            try {
              const target = parseRoomInput(input, selected);
              const preference = getRoomPreference(target.platform, target.roomId);
              const message = await replaceStream(
                replaceKey,
                { ...defaultStreamOptions(target.platform), ...(preference ?? {}), ...target },
                (playback) => {
                  recordVisit({
                    platform: playback.platform,
                    roomId: playback.roomId,
                    title: playback.title,
                    anchorName: playback.anchorName,
                    ...(playback.cover ? { cover: playback.cover } : {}),
                  });
                  setMainStreamKey((current) =>
                    current === replaceKey ? streamKey(playback) : current,
                  );
                },
              );
              return message === ADD_CANCELLED ? null : message;
            } catch (reason) {
              return reason instanceof Error ? reason.message : '替换失败';
            }
          }}
        />
      ) : null}

      {isDanmakuSettingsOpen ? (
        <div className="danmaku-settings-dock" ref={danmakuSettingsRef}>
          <DanmakuSettingsPanel onClose={() => setDanmakuSettingsOpen(false)} />
        </div>
      ) : null}
    </div>
  );
}
