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
import { EmptyStage } from './features/player/EmptyStage';
import { StreamGrid } from './features/player/StreamGrid';
import { MAX_STREAMS, canAddStream } from './features/player/streamGridLayout';
import { defaultStreamOptions, useStreamGrid } from './features/player/useStreamGrid';
import type { StreamResolveOptions } from './features/player/useStreamGrid';
import { isEditableTarget } from './lib/keyboard';
import { platformLabel } from './lib/streamIdentity';
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

export function App(): React.JSX.Element {
  const { activeAccount } = useAccounts();
  const {
    streams,
    isAdding,
    reloadingKey,
    mutedRooms,
    volumes,
    addStream,
    reloadStream,
    setStreamOptions,
    removeStream,
    clearStreams,
    toggleMute,
    setVolume,
  } = useStreamGrid();
  const [platform, setPlatform] = useState<StreamPlatform>('douyu');
  const [roomId, setRoomId] = useState('9999');
  const [error, setError] = useState<string | null>(null);
  const [isDanmakuSettingsOpen, setDanmakuSettingsOpen] = useState(false);
  const [isHistoryOpen, setHistoryOpen] = useState(false);
  const [isTaskOpen, setTaskOpen] = useState(false);
  const [isImmersive, setImmersive] = useState(false);
  const [isImmersiveExitVisible, setImmersiveExitVisible] = useState(false);
  const roomInputRef = useRef<HTMLInputElement>(null);
  const danmakuSettingsRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const immersiveExitTimerRef = useRef<number | null>(null);
  const { entries: roomHistory, recordVisit, removeHistory, clearHistory } = useRoomHistory();

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
      setImmersive((value) => !value);
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [streams.length]);

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

  async function handleAdd(targetPlatform: StreamPlatform, targetRoomId: string): Promise<void> {
    setError(null);
    const message = await addStream(
      {
        platform: targetPlatform,
        roomId: targetRoomId,
        ...defaultStreamOptions(targetPlatform),
      },
      (playback) => {
        recordVisit({
          platform: playback.platform,
          roomId: playback.roomId,
          title: playback.title,
          anchorName: playback.anchorName,
        });
      },
    );
    if (message) {
      setError(message);
      return;
    }
    setRoomId('');
    focusRoomInput();
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
    if (isAdding) return '解析中…';
    if (!canAdd) return `已满 ${MAX_STREAMS} 路`;
    return streams.length > 0 ? '添加' : '播放';
  }

  function addButtonIcon(): 'refresh' | 'plus' | 'play' {
    if (isAdding) return 'refresh';
    return streams.length > 0 ? 'plus' : 'play';
  }

  return (
    <div
      className={`window-frame${isImmersive ? ' is-immersive' : ''}`}
      onPointerEnter={isImmersive ? showImmersiveExit : undefined}
      onPointerLeave={hideImmersiveExit}
      onPointerMove={isImmersive ? showImmersiveExit : undefined}
    >
      <AutoSignRunner account={activeAccount} />
      <TitleBar>
        <div className="titlebar-tab" aria-label={`直播工作台，当前 ${streams.length} 路`}>
          <Icon name="live" size={14} />
          <strong>直播</strong>
          <span className="titlebar-count">
            {streams.length}/{MAX_STREAMS}
          </span>
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
              placeholder={roomPlaceholder(platform)}
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
            disabled={isAdding || !canSubmit}
          >
            <Icon name={addButtonIcon()} size={15} />
            {addButtonLabel()}
          </button>

          {streams.length > 0 ? (
            <button
              type="button"
              className="btn ghost titlebar-clear"
              onClick={clearStreams}
              disabled={isAdding}
            >
              清空
            </button>
          ) : null}
        </form>

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
        <main className="main">
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
                  immersive={isImmersive}
                  reloadingKey={reloadingKey}
                  mutedRooms={mutedRooms}
                  volumes={volumes}
                  onReload={handleReload}
                  onOptionsChange={handleStreamOptionsChange}
                  onRemove={removeStream}
                  onToggleMute={toggleMute}
                  onVolumeChange={setVolume}
                  onOpenDanmakuSettings={() => setDanmakuSettingsOpen(true)}
                  onToggleImmersive={toggleImmersive}
                  onRequestAdd={focusRoomInput}
                />
              )}
            </div>
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

      {isDanmakuSettingsOpen ? (
        <div className="danmaku-settings-dock" ref={danmakuSettingsRef}>
          <DanmakuSettingsPanel onClose={() => setDanmakuSettingsOpen(false)} />
        </div>
      ) : null}
    </div>
  );
}
