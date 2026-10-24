import type { StreamPlayback } from '@shared/contracts/stream';
import { Icon } from '../../components/Icon';
import { VideoPlayer } from './VideoPlayer';

interface PlayerTileProps {
  playback: StreamPlayback;
  isReloading: boolean;
  compact?: boolean;
  error?: string | null;
  muted: boolean;
  volume: number;
  onReload: () => void;
  onStop: () => void;
  onToggleMute: () => void;
  onVolumeChange: (volume: number) => void;
}

export function PlayerTile({
  playback,
  isReloading,
  compact = false,
  error = null,
  muted,
  volume,
  onReload,
  onStop,
  onToggleMute,
  onVolumeChange,
}: PlayerTileProps): React.JSX.Element {
  return (
    <section className={`player-card${compact ? ' is-compact' : ''}`}>
      <header className="player-head">
        <div className="player-title">
          <span className="live-pill">
            <i className="live-dot" />
            LIVE
          </span>
          <div>
            <h2>{playback.title || `房间 ${playback.roomId}`}</h2>
            <p>
              {playback.anchorName || '斗鱼主播'} · 房间 {playback.roomId}
            </p>
          </div>
        </div>
        <div className="player-actions">
          <span className="tag">{playback.quality}</span>
          <span className="tag">{playback.format.toUpperCase()}</span>
          <button
            type="button"
            className="icon-btn"
            onClick={onReload}
            disabled={isReloading}
            aria-label="重新解析"
            title="重新解析"
          >
            <Icon name="refresh" size={compact ? 15 : 17} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={onStop}
            aria-label="关闭播放"
            title="关闭播放"
          >
            <Icon name="close" size={compact ? 15 : 17} />
          </button>
        </div>
      </header>

      {error ? (
        <div className="player-alert" role="alert">
          <Icon name="alert" size={14} />
          <span>{error}</span>
          <button type="button" onClick={onReload} disabled={isReloading}>
            重试
          </button>
        </div>
      ) : null}

      <VideoPlayer
        playback={playback}
        muted={muted}
        volume={volume}
        onToggleMute={onToggleMute}
        onVolumeChange={onVolumeChange}
      />

      <footer className="player-foot">
        <span>
          <i className="status-dot active" />
          已获取播放地址
        </span>
        <span>{playback.format === 'hls' ? 'HLS 分片' : 'HTTP-FLV'} · 本地解码</span>
        <span>{compact ? '多路' : '单路'}</span>
      </footer>
    </section>
  );
}
