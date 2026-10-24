import { Icon } from '../../components/Icon';
import { PlayerTile } from './PlayerTile';
import { getStreamLayout, MAX_STREAMS } from './streamGridLayout';
import { DEFAULT_VOLUME } from './useStreamGrid';
import type { StreamGridEntry, StreamResolveOptions } from './useStreamGrid';

interface StreamGridProps {
  streams: StreamGridEntry[];
  reloadingRoomId: string | null;
  mutedRooms: Record<string, boolean>;
  volumes: Record<string, number>;
  onReload: (roomId: string) => void;
  onOptionsChange: (roomId: string, patch: Partial<StreamResolveOptions>) => void;
  onRemove: (roomId: string) => void;
  onToggleMute: (roomId: string) => void;
  onVolumeChange: (roomId: string, volume: number) => void;
  onOpenDanmakuSettings: () => void;
  onRequestAdd: () => void;
}

export function StreamGrid({
  streams,
  reloadingRoomId,
  mutedRooms,
  volumes,
  onReload,
  onOptionsChange,
  onRemove,
  onToggleMute,
  onVolumeChange,
  onOpenDanmakuSettings,
  onRequestAdd,
}: StreamGridProps): React.JSX.Element {
  const layout = getStreamLayout(streams.length);
  const showEmptySlot = streams.length === MAX_STREAMS - 1;

  return (
    <div className={`stream-grid is-${layout}`}>
      {streams.map((entry) => (
        <PlayerTile
          key={entry.playback.roomId}
          playback={entry.playback}
          error={entry.error}
          compact={streams.length > 1}
          muted={mutedRooms[entry.playback.roomId] === true}
          volume={volumes[entry.playback.roomId] ?? DEFAULT_VOLUME}
          quality={entry.options.quality}
          preferHls={entry.options.preferHls}
          isReloading={reloadingRoomId === entry.playback.roomId}
          onReload={() => onReload(entry.playback.roomId)}
          onOptionsChange={(patch) => onOptionsChange(entry.playback.roomId, patch)}
          onStop={() => onRemove(entry.playback.roomId)}
          onToggleMute={() => onToggleMute(entry.playback.roomId)}
          onVolumeChange={(volume) => onVolumeChange(entry.playback.roomId, volume)}
          onOpenDanmakuSettings={onOpenDanmakuSettings}
        />
      ))}

      {showEmptySlot ? (
        <button type="button" className="grid-slot" onClick={onRequestAdd}>
          <span className="grid-slot-icon">
            <Icon name="plus" size={20} />
          </span>
          <strong>再加一路</strong>
          <small>最多 {MAX_STREAMS} 路同屏</small>
        </button>
      ) : null}
    </div>
  );
}
