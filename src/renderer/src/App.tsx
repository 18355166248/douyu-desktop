import { useState } from 'react';
import type { DouyuQuality, StreamPlayback } from '@shared/contracts/stream';
import { Icon } from './components/Icon';
import { AccountBar } from './features/accounts/AccountBar';
import { useAccounts } from './features/accounts/useAccounts';
import { EmptyStage } from './features/player/EmptyStage';
import { PlayerTile } from './features/player/PlayerTile';
import { TaskPanel } from './features/tasks/TaskPanel';
import { errorMessage, unwrap } from './lib/api';

const qualityOptions: Array<{ value: DouyuQuality; label: string }> = [
  { value: '0', label: '原画' },
  { value: '3', label: '高清' },
  { value: '4', label: '超清' },
  { value: '8', label: '蓝光' },
];

export function App(): React.JSX.Element {
  const { activeAccount } = useAccounts();
  const [roomId, setRoomId] = useState('9999');
  const [quality, setQuality] = useState<DouyuQuality>('0');
  const [preferHls, setPreferHls] = useState(false);
  const [playback, setPlayback] = useState<StreamPlayback | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startPlayback(targetRoomId: string): Promise<void> {
    const normalized = targetRoomId.trim();
    if (!normalized) {
      setError('请输入斗鱼房间号');
      return;
    }

    setIsResolving(true);
    setError(null);
    try {
      const data = unwrap(
        await window.api.streams.resolve({ roomId: normalized, quality, preferHls }),
      );
      setPlayback(data);
      setRoomId(normalized);
    } catch (resolveError) {
      setError(errorMessage(resolveError));
    } finally {
      setIsResolving(false);
    }
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
          <button type="button" className="nav-item" disabled title="P1 开放">
            <Icon name="tasks" size={18} />
            多路布局
            <span className="soon">SOON</span>
          </button>
          <button type="button" className="nav-item" disabled title="P1 开放">
            <Icon name="settings" size={18} />
            设置
            <span className="soon">SOON</span>
          </button>
        </nav>

        <div className="side-card">
          <div className="side-card-top">
            <span className="eyebrow">P0 · VERTICAL SLICE</span>
            <span className="mini-badge">1 / 4</span>
          </div>
          <p>先跑通登录、解析、播放和签到，再扩 4/9 宫格。</p>
          <div className="pipeline">
            <span className="pipeline-step done">登录</span>
            <span className="pipeline-step done">解析</span>
            <span className="pipeline-step done">播放</span>
            <span className="pipeline-step">签到</span>
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
            void startPlayback(roomId);
          }}
        >
          <div className="room-field">
            <Icon name="live" size={18} />
            <input
              value={roomId}
              onChange={(event) => setRoomId(event.target.value)}
              placeholder="输入斗鱼真实房间号，例如 9999"
              spellCheck={false}
              aria-label="斗鱼房间号"
            />
          </div>

          <label className="select-wrap">
            <span className="sr-only">画质</span>
            <select
              value={quality}
              onChange={(event) => setQuality(event.target.value as DouyuQuality)}
            >
              {qualityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="check">
            <input
              type="checkbox"
              checked={preferHls}
              onChange={(event) => setPreferHls(event.target.checked)}
            />
            HLS
          </label>

          <button type="submit" className="btn primary" disabled={isResolving}>
            <Icon name={isResolving ? 'refresh' : 'play'} size={16} />
            {isResolving ? '解析中…' : '播放'}
          </button>
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
            {playback ? (
              <PlayerTile
                playback={playback}
                isReloading={isResolving}
                onReload={() => void startPlayback(playback.roomId)}
                onStop={() => setPlayback(null)}
              />
            ) : (
              <EmptyStage
                onPickExample={() => {
                  setRoomId('9999');
                  void startPlayback('9999');
                }}
              />
            )}
          </div>
          <TaskPanel hasAccount={Boolean(activeAccount && activeAccount.status === 'active')} />
        </div>

        <footer className="statusbar">
          <span>
            <i className={`status-dot ${activeAccount ? 'active' : ''}`} />
            {activeAccount ? `账号 ${activeAccount.nickname}` : '未登录斗鱼'}
          </span>
          <span>
            {playback
              ? `房间 ${playback.roomId} · ${playback.format.toUpperCase()} · ${playback.quality}`
              : '等待播放'}
          </span>
          <span>P0 · 单路模式</span>
        </footer>
      </main>
    </div>
  );
}
