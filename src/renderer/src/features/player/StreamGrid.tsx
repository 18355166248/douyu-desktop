import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { streamKey } from '../../lib/streamIdentity';
import { PlayerTile } from './PlayerTile';
import { getStreamLayout, MAX_STREAMS } from './streamGridLayout';
import type { StreamLayoutMode } from './streamGridLayout';
import { DEFAULT_VOLUME } from './useStreamGrid';
import type { StreamGridEntry, StreamResolveOptions } from './useStreamGrid';

interface StreamGridProps {
  streams: StreamGridEntry[];
  layoutMode: StreamLayoutMode;
  mainKey: string | null;
  immersive: boolean;
  keyboardActive?: boolean;
  reloadingKey: string | null;
  mutedRooms: Record<string, boolean>;
  volumes: Record<string, number>;
  soloKey: string | null;
  onReload: (key: string) => void;
  onOptionsChange: (key: string, patch: Partial<StreamResolveOptions>) => void;
  onRemove: (key: string) => void;
  onSetMain: (key: string) => void;
  onToggleMute: (key: string) => void;
  onToggleSolo: (key: string) => void;
  onVolumeChange: (key: string, volume: number) => void;
  onOpenDanmakuSettings: () => void;
  onToggleImmersive: () => void;
  onRequestAdd: () => void;
}

export function StreamGrid({
  streams,
  layoutMode,
  mainKey,
  immersive,
  keyboardActive = true,
  reloadingKey,
  mutedRooms,
  volumes,
  soloKey,
  onReload,
  onOptionsChange,
  onRemove,
  onSetMain,
  onToggleMute,
  onToggleSolo,
  onVolumeChange,
  onOpenDanmakuSettings,
  onToggleImmersive,
  onRequestAdd,
}: StreamGridProps): React.JSX.Element {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const layout = getStreamLayout(streams.length, layoutMode);
  const showEmptySlot = layoutMode === 'even' && streams.length === MAX_STREAMS - 1;
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
        const isMain = layoutMode === 'focus' && streams.length > 1 && key === mainKey;
        return (
          <PlayerTile
            key={key}
            playback={entry.playback}
            error={entry.error}
            compact={streams.length > 1}
            immersive={immersive}
            isMain={isMain}
            canSolo={streams.length > 1}
            isSolo={soloKey === key}
            shortcutsEnabled={keyboardActive && currentKey === key}
            muted={mutedRooms[key] === true}
            volume={volumes[key] ?? DEFAULT_VOLUME}
            quality={entry.options.quality}
            preferHls={entry.options.preferHls}
            isReloading={reloadingKey === key}
            onActivate={() => setActiveKey(key)}
            onReload={() => onReload(key)}
            onOptionsChange={(patch) => onOptionsChange(key, patch)}
            onStop={() => onRemove(key)}
            {...(layoutMode === 'focus' && !isMain
              ? { onSetMain: () => onSetMain(key) }
              : {})}
            onToggleMute={() => onToggleMute(key)}
            onToggleSolo={() => onToggleSolo(key)}
            onVolumeChange={(volume) => onVolumeChange(key, volume)}
            onOpenDanmakuSettings={onOpenDanmakuSettings}
            onToggleImmersive={onToggleImmersive}
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
