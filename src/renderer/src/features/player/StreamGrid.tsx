import { Icon } from '../../components/Icon';
import { PlayerTile } from './PlayerTile';
import { getStreamLayout, MAX_STREAMS } from './streamGridLayout';
import type { StreamGridEntry } from './useStreamGrid';

interface StreamGridProps {
  streams: StreamGridEntry[];
  reloadingRoomId: string | null;
  audioRoomId: string | null;
  onReload: (roomId: string) => void;
  onRemove: (roomId: string) => void;
  onToggleAudio: (roomId: string) => void;
  onRequestAdd: () => void;
}

export function StreamGrid({
  streams,
  reloadingRoomId,
  audioRoomId,
  onReload,
  onRemove,
  onToggleAudio,
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
          muted={audioRoomId !== entry.playback.roomId}
          isReloading={reloadingRoomId === entry.playback.roomId}
          onReload={() => onReload(entry.playback.roomId)}
          onStop={() => onRemove(entry.playback.roomId)}
          onToggleMute={() => onToggleAudio(entry.playback.roomId)}
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
