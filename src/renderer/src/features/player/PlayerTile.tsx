import type { StreamPlayback } from '@shared/contracts/stream';
import { Icon } from '../../components/Icon';
import { VideoPlayer } from './VideoPlayer';

interface PlayerTileProps {
  playback: StreamPlayback;
  isReloading: boolean;
  onReload: () => void;
  onStop: () => void;
}

export function PlayerTile({
  playback,
  isReloading,
  onReload,
  onStop,
}: PlayerTileProps): React.JSX.Element {
  return (
    <section className="player-card">
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
            <Icon name="refresh" size={17} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={onStop}
            aria-label="关闭播放"
            title="关闭播放"
          >
            <Icon name="close" size={17} />
          </button>
        </div>
      </header>

      <VideoPlayer playback={playback} />

      <footer className="player-foot">
        <span>
          <i className="status-dot active" />
          已获取播放地址
        </span>
        <span>{playback.format === 'hls' ? 'HLS 分片' : 'HTTP-FLV'} · 本地解码</span>
        <span>P0 · 单路模式</span>
      </footer>
    </section>
  );
}
