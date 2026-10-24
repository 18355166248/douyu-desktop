import { useEffect, useRef, useState } from 'react';
import { Icon } from './components/Icon';
import { AccountBar } from './features/accounts/AccountBar';
import { useAccounts } from './features/accounts/useAccounts';
import { DanmakuSettingsPanel } from './features/danmaku/DanmakuSettingsPanel';
import { EmptyStage } from './features/player/EmptyStage';
import { StreamGrid } from './features/player/StreamGrid';
import { MAX_STREAMS, canAddStream } from './features/player/streamGridLayout';
import { DEFAULT_STREAM_OPTIONS, useStreamGrid } from './features/player/useStreamGrid';
import type { StreamResolveOptions } from './features/player/useStreamGrid';
import { TaskPanel } from './features/tasks/TaskPanel';

export function App(): React.JSX.Element {
  const { activeAccount } = useAccounts();
  const {
    streams,
    isAdding,
    reloadingRoomId,
    audioRoomId,
    volumes,
    addStream,
    reloadStream,
    setStreamOptions,
    removeStream,
    clearStreams,
    toggleAudio,
    setVolume,
  } = useStreamGrid();
  const [roomId, setRoomId] = useState('9999');
  const [error, setError] = useState<string | null>(null);
  const [isDanmakuSettingsOpen, setDanmakuSettingsOpen] = useState(false);
  const roomInputRef = useRef<HTMLInputElement>(null);
  const danmakuSettingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isDanmakuSettingsOpen) return;

    const handlePointerDown = (event: PointerEvent): void => {
      if (event.target instanceof Node && danmakuSettingsRef.current?.contains(event.target)) {
        return;
      }
      setDanmakuSettingsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setDanmakuSettingsOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDanmakuSettingsOpen]);

  const canAdd = canAddStream(streams.length);
  const canSubmit = canAdd && roomId.trim().length > 0;

  async function handleAdd(targetRoomId: string): Promise<void> {
    setError(null);
    const message = await addStream({ roomId: targetRoomId, ...DEFAULT_STREAM_OPTIONS });
    if (message) {
      setError(message);
      return;
    }
    setRoomId('');
    focusRoomInput();
  }

  function handleReload(targetRoomId: string): void {
    void reloadStream(targetRoomId).then((message) => {
      if (message) setError(message);
    });
  }

  function handleStreamOptionsChange(
    targetRoomId: string,
    patch: Partial<StreamResolveOptions>,
  ): void {
    void setStreamOptions(targetRoomId, patch).then((message) => {
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
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Icon name="live" size={22} />
          </div>
          <div className="brand-text">
            <strong>斗鱼多屏</strong>
            <span>DOUYU DESKTOP</span>
          </div>
        </div>

        <nav className="nav" aria-label="主导航">
          <button type="button" className="nav-item is-active">
            <Icon name="live" size={18} />
            直播
            <i className="nav-dot" />
          </button>
          <button
            type="button"
            className="nav-item"
            onClick={focusRoomInput}
            title="聚焦房间输入，添加下一路直播"
          >
            <Icon name="grid" size={18} />
            多路布局
            <span className="soon">4 路</span>
          </button>
          <button type="button" className="nav-item" disabled title="后续开放">
            <Icon name="settings" size={18} />
            设置
            <span className="soon">SOON</span>
          </button>
        </nav>

        <div className="side-card">
          <div className="side-card-top">
            <span className="eyebrow">P2 · LIVE + DANMAKU</span>
            <span className="mini-badge">
              {streams.length} / {MAX_STREAMS}
            </span>
          </div>
          <p>最多 4 路同屏。每路独立解析、实时弹幕与错误处理，同一时间只保留一路声音。</p>
          <div className="pipeline">
            <span className="pipeline-step done">登录</span>
            <span className="pipeline-step done">解析</span>
            <span className={`pipeline-step${streams.length > 0 ? ' done' : ''}`}>播放</span>
            <span className={`pipeline-step${streams.length > 0 ? ' done' : ''}`}>弹幕</span>
          </div>
        </div>

        <div className="sidebar-foot">
          <i className="status-dot active" />
          本地运行 · Cookie 隔离
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="page-title">
            <span className="eyebrow">LIVE WORKSPACE</span>
            <h1>直播</h1>
          </div>
          <AccountBar />
        </header>

        <form
          className="toolbar"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) void handleAdd(roomId);
          }}
        >
          <div className="room-field">
            <Icon name="live" size={18} />
            <input
              ref={roomInputRef}
              value={roomId}
              onChange={(event) => setRoomId(event.target.value)}
              placeholder="输入斗鱼真实房间号，例如 9999"
              spellCheck={false}
              aria-label="斗鱼房间号"
            />
          </div>

          <div
            className="stream-count"
            aria-label={`当前 ${streams.length} 路，最多 ${MAX_STREAMS} 路`}
          >
            <strong>{streams.length}</strong>
            <span>/ {MAX_STREAMS}</span>
          </div>

          <div className="danmaku-settings-anchor" ref={danmakuSettingsRef}>
            <button
              type="button"
              className={`btn ghost toolbar-danmaku${isDanmakuSettingsOpen ? ' is-active' : ''}`}
              onClick={() => setDanmakuSettingsOpen((open) => !open)}
              aria-expanded={isDanmakuSettingsOpen}
              aria-haspopup="dialog"
              title="弹幕设置"
            >
              <Icon name="settings" size={15} />
              弹幕设置
            </button>
            {isDanmakuSettingsOpen ? (
              <DanmakuSettingsPanel onClose={() => setDanmakuSettingsOpen(false)} />
            ) : null}
          </div>

          <button type="submit" className="btn primary" disabled={isAdding || !canSubmit}>
            <Icon name={addButtonIcon()} size={16} />
            {addButtonLabel()}
          </button>

          {streams.length > 0 ? (
            <button
              type="button"
              className="btn ghost toolbar-clear"
              onClick={clearStreams}
              disabled={isAdding}
            >
              清空
            </button>
          ) : null}
        </form>

        {error ? (
          <div className="alert" role="alert">
            <Icon name="alert" size={18} />
            <span>{error}</span>
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
                  setRoomId('9999');
                  void handleAdd('9999');
                }}
              />
            ) : (
              <StreamGrid
                streams={streams}
                reloadingRoomId={reloadingRoomId}
                audioRoomId={audioRoomId}
                volumes={volumes}
                onReload={handleReload}
                onOptionsChange={handleStreamOptionsChange}
                onRemove={removeStream}
                onToggleAudio={toggleAudio}
                onVolumeChange={setVolume}
                onRequestAdd={focusRoomInput}
              />
            )}
          </div>
          <TaskPanel hasAccount={Boolean(activeAccount && activeAccount.status === 'active')} />
        </div>

        <footer className="statusbar">
          <span>
            <i
              className={`status-dot ${
                activeAccount ? (activeAccount.status === 'active' ? 'active' : 'expired') : ''
              }`}
            />
            {activeAccount
              ? `账号 ${activeAccount.nickname}${
                  activeAccount.status === 'active' ? '' : ' · 登录过期'
                }`
              : '未登录斗鱼'}
          </span>
          <span>
            {streams.length > 0 ? `${streams.length} / ${MAX_STREAMS} 路 · 多路同屏` : '等待播放'}
          </span>
          <span>P2 · 多路 + 弹幕</span>
        </footer>
      </main>
    </div>
  );
}
