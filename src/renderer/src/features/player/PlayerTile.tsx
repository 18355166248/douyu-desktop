import { primaryKey, primaryAria } from '../../lib/keyboard';
import { useQueryClient } from '@tanstack/react-query';
import type { StreamPlayback, StreamQuality } from '@shared/contracts/stream';
import { Icon } from '../../components/Icon';
import { platformLabel } from '../../lib/streamIdentity';
import { RoomAudience } from './RoomAudience';
import { roomAudienceKey } from './useRoomAudience';
import type { StreamResolveOptions } from './useStreamGrid';
import { VideoPlayer } from './VideoPlayer';

interface PlayerTileProps {
  playback: StreamPlayback;
  isReloading: boolean;
  compact?: boolean;
  error?: string | null;
  immersive?: boolean;
  isMain?: boolean;
  canSolo?: boolean;
  isSolo?: boolean;
  gridSlot?: string;
  shortcutsEnabled?: boolean;
  onActivate?: () => void;
  muted: boolean;
  volume: number;
  quality: StreamQuality;
  preferHls: boolean;
  onReload: () => void;
  onOptionsChange: (patch: Partial<StreamResolveOptions>) => void;
  onStop: () => void;
  onSetMain?: () => void;
  onToggleMute: () => void;
  onToggleSolo: () => void;
  onVolumeChange: (volume: number) => void;
  onOpenDanmakuSettings: () => void;
  onToggleImmersive: () => void;
  onDropRoom?: (key: string) => void;
  onMoveBefore?: (() => void) | undefined;
  onMoveAfter?: (() => void) | undefined;
  onReplace: () => void;
}

export function PlayerTile({
  playback,
  isReloading,
  compact = false,
  error = null,
  immersive = false,
  isMain = false,
  canSolo = false,
  isSolo = false,
  gridSlot,
  shortcutsEnabled = false,
  onActivate,
  muted,
  volume,
  quality,
  preferHls,
  onReload,
  onOptionsChange,
  onStop,
  onSetMain,
  onToggleMute,
  onToggleSolo,
  onVolumeChange,
  onOpenDanmakuSettings,
  onToggleImmersive,
  onDropRoom,
  onMoveBefore,
  onMoveAfter,
  onReplace,
}: PlayerTileProps): React.JSX.Element {
  const queryClient = useQueryClient();
  const anchorName = playback.anchorName?.trim() || `${platformLabel(playback.platform)}主播`;

  function reloadPlaybackAndAudience(): void {
    onReload();
    void queryClient.invalidateQueries({
      queryKey: roomAudienceKey(playback.platform, playback.roomId),
    });
  }

  return (
    <section
      className={`player-card${compact ? ' is-compact' : ''}${isMain ? ' is-main' : ''}${
        gridSlot ? ` focus-slot-${gridSlot}` : ''
      }`}
      onPointerEnter={onActivate}
      onFocusCapture={onActivate}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('application/x-douyu-room')) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
        }
      }}
      onDrop={(event) => {
        const from = event.dataTransfer.getData('application/x-douyu-room');
        if (from) {
          event.preventDefault();
          onDropRoom?.(from);
        }
      }}
    >
      <header className="player-head">
        <div className="player-title">
          <span className="live-pill">
            <i className="live-dot" />
            LIVE
          </span>
          <div>
            <h2>{playback.title || `房间 ${playback.roomId}`}</h2>
            <p>
              {anchorName} · 房间 {playback.roomId}
            </p>
          </div>
        </div>

        {playback.platform === 'douyu' ? (
          <RoomAudience platform={playback.platform} roomId={playback.roomId} />
        ) : null}

        <div className="player-actions">
          {compact ? (
            <button
              type="button"
              className="icon-btn room-drag-handle"
              draggable
              aria-label={`调整${anchorName}位置，方向键前后移动`}
              title="拖动调整位置，聚焦后按方向键移动"
              onDragStart={(event) => {
                event.dataTransfer.setData(
                  'application/x-douyu-room',
                  `${playback.platform}:${playback.roomId}`,
                );
                event.dataTransfer.effectAllowed = 'move';
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                  event.preventDefault();
                  event.stopPropagation();
                  onMoveBefore?.();
                } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                  event.preventDefault();
                  event.stopPropagation();
                  onMoveAfter?.();
                }
              }}
            >
              <Icon name="grip" size={15} />
            </button>
          ) : null}
          <span className="tag">{platformLabel(playback.platform)}</span>
          <span className="tag">{playback.quality}</span>
          <span className="tag">{playback.format.toUpperCase()}</span>
          {isMain ? <span className="player-main-badge">主画面</span> : null}
          {onSetMain ? (
            <button
              type="button"
              className="icon-btn main-room-button"
              onClick={onSetMain}
              aria-label={`将${anchorName}设为主画面`}
              title="设为主画面"
            >
              <Icon name="mainView" size={compact ? 15 : 17} />
            </button>
          ) : null}
          <button
            type="button"
            className="icon-btn"
            onClick={reloadPlaybackAndAudience}
            disabled={isReloading}
            aria-label="重新解析并刷新房间统计"
            aria-keyshortcuts={`R ${primaryAria}+R F5`}
            title={
              isReloading
                ? '正在重新解析并刷新统计'
                : `重新解析播放并刷新房间统计（R / ${primaryKey}+R / F5）`
            }
          >
            <Icon name="refresh" size={compact ? 15 : 17} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={onStop}
            aria-label="关闭播放"
            aria-keyshortcuts={`X ${primaryAria}+W`}
            title={`关闭播放（X / ${primaryKey}+W）`}
          >
            <Icon name="close" size={compact ? 15 : 17} />
          </button>
        </div>
      </header>

      {playback.platform === 'douyu' ? null : (
        <RoomAudience platform={playback.platform} roomId={playback.roomId} />
      )}

      {error ? (
        <div className="player-alert" role="alert">
          <Icon name="alert" size={14} />
          <span className="selectable">{error}</span>
          <button type="button" onClick={reloadPlaybackAndAudience} disabled={isReloading}>
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
        shortcutsEnabled={shortcutsEnabled}
        immersive={immersive}
        canSolo={canSolo}
        isSolo={isSolo}
        onReload={reloadPlaybackAndAudience}
        onToggleMute={onToggleMute}
        onToggleSolo={onToggleSolo}
        onVolumeChange={onVolumeChange}
        onOptionsChange={onOptionsChange}
        onOpenDanmakuSettings={onOpenDanmakuSettings}
        onToggleImmersive={onToggleImmersive}
        onStop={onStop}
        onReplace={onReplace}
      />

      {immersive ? (
        <div className="immersive-anchor" title={`${anchorName} · 房间 ${playback.roomId}`}>
          <strong>{anchorName}</strong>
          <span>房间 {playback.roomId}</span>
        </div>
      ) : null}
    </section>
  );
}
