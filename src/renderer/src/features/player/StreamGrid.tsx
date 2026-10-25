import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { streamKey } from '../../lib/streamIdentity';
import { PlayerTile } from './PlayerTile';
import { getStreamLayout, MAX_STREAMS } from './streamGridLayout';
import { DEFAULT_VOLUME } from './useStreamGrid';
import type { StreamGridEntry, StreamResolveOptions } from './useStreamGrid';

interface StreamGridProps {
  streams: StreamGridEntry[];
  immersive: boolean;
  reloadingKey: string | null;
  mutedRooms: Record<string, boolean>;
  volumes: Record<string, number>;
  onReload: (key: string) => void;
  onOptionsChange: (key: string, patch: Partial<StreamResolveOptions>) => void;
  onRemove: (key: string) => void;
  onToggleMute: (key: string) => void;
  onVolumeChange: (key: string, volume: number) => void;
  onOpenDanmakuSettings: () => void;
  onRequestAdd: () => void;
}

export function StreamGrid({
  streams,
  immersive,
  reloadingKey,
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
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const layout = getStreamLayout(streams.length);
  const showEmptySlot = streams.length === MAX_STREAMS - 1;
  const firstEntry = streams[0];
  const firstKey = firstEntry ? streamKey(firstEntry.playback) : null;
  const currentKey =
    activeKey && streams.some((entry) => streamKey(entry.playback) === activeKey)
      ? activeKey
      : firstKey;

  return (
    <div className={`stream-grid is-${layout}`}>
      {streams.map((entry) => {
        const key = streamKey(entry.playback);
        return (
          <PlayerTile
            key={key}
            playback={entry.playback}
            error={entry.error}
            compact={streams.length > 1}
            immersive={immersive}
            shortcutsEnabled={currentKey === key}
            muted={mutedRooms[key] === true}
            volume={volumes[key] ?? DEFAULT_VOLUME}
            quality={entry.options.quality}
            preferHls={entry.options.preferHls}
            isReloading={reloadingKey === key}
            onActivate={() => setActiveKey(key)}
            onReload={() => onReload(key)}
            onOptionsChange={(patch) => onOptionsChange(key, patch)}
            onStop={() => onRemove(key)}
            onToggleMute={() => onToggleMute(key)}
            onVolumeChange={(volume) => onVolumeChange(key, volume)}
            onOpenDanmakuSettings={onOpenDanmakuSettings}
          />
        );
      })}

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
