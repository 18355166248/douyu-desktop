import type { StreamPlayback, StreamQuality } from '@shared/contracts/stream';
import { Icon } from '../../components/Icon';
import { platformLabel } from '../../lib/streamIdentity';
import type { StreamResolveOptions } from './useStreamGrid';
import { VideoPlayer } from './VideoPlayer';

interface PlayerTileProps {
  playback: StreamPlayback;
  isReloading: boolean;
  compact?: boolean;
  error?: string | null;
  muted: boolean;
  volume: number;
  quality: StreamQuality;
  preferHls: boolean;
  onReload: () => void;
  onOptionsChange: (patch: Partial<StreamResolveOptions>) => void;
  onStop: () => void;
  onToggleMute: () => void;
  onVolumeChange: (volume: number) => void;
  onOpenDanmakuSettings: () => void;
}

export function PlayerTile({
  playback,
  isReloading,
  compact = false,
  error = null,
  muted,
  volume,
  quality,
  preferHls,
  onReload,
  onOptionsChange,
  onStop,
  onToggleMute,
  onVolumeChange,
  onOpenDanmakuSettings,
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
              {playback.anchorName || `${platformLabel(playback.platform)}主播`} · 房间{' '}
              {playback.roomId}
            </p>
          </div>
        </div>
        <div className="player-actions">
          <span className="tag">{platformLabel(playback.platform)}</span>
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
          <span className="selectable">{error}</span>
          <button type="button" onClick={onReload} disabled={isReloading}>
            重试
          </button>
        </div>
      ) : null}

      <VideoPlayer
        playback={playback}
        muted={muted}
        volume={volume}
        quality={quality}
        preferHls={preferHls}
        isReloading={isReloading}
        onReload={onReload}
        onToggleMute={onToggleMute}
        onVolumeChange={onVolumeChange}
        onOptionsChange={onOptionsChange}
        onOpenDanmakuSettings={onOpenDanmakuSettings}
      />
    </section>
  );
}
