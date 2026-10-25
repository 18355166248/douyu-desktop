import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { PLATFORM_ICON_URLS } from '../../lib/platformAssets';
import { platformLabel } from '../../lib/streamIdentity';
import { formatHistoryTime, historyLabel } from './roomHistory';
import type { RoomHistoryEntry } from './roomHistory';

interface RoomHistoryRowProps {
  entry: RoomHistoryEntry;
  cover: string | undefined;
  selected: boolean;
  managing: boolean;
  onActivate: () => void;
  onRemove: () => void;
}

interface HistoryThumbnailProps {
  entry: RoomHistoryEntry;
  cover: string | undefined;
}

function HistoryThumbnail({ entry, cover }: HistoryThumbnailProps): React.JSX.Element {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [cover]);

  const showCover = Boolean(cover) && !failed;
  return (
    <span
      className={`history-thumb is-${entry.platform}${showCover ? '' : ' is-fallback'}`}
      aria-hidden="true"
    >
      {showCover ? (
        <img
          className="history-thumb-image"
          src={cover}
          alt=""
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : (
        <>
          <img
            className="history-thumb-fallback-icon"
            src={PLATFORM_ICON_URLS[entry.platform]}
            alt=""
            draggable={false}
          />
          <span className="history-thumb-fallback-text">暂无封面</span>
        </>
      )}
      <span className={`history-platform is-${entry.platform}`}>
        <img
          className="history-platform-icon"
          src={PLATFORM_ICON_URLS[entry.platform]}
          width={16}
          height={16}
          alt=""
          draggable={false}
        />
        <span>{platformLabel(entry.platform)}</span>
      </span>
    </span>
  );
}

export function RoomHistoryRow({
  entry,
  cover,
  selected,
  managing,
  onActivate,
  onRemove,
}: RoomHistoryRowProps): React.JSX.Element {
  const platform = platformLabel(entry.platform);
  const roomLabel = historyLabel(entry);

  return (
    <div
      className={`history-item${managing ? ' is-managing' : ''}${selected ? ' is-selected' : ''}`}
    >
      <button
        type="button"
        className="history-item-open"
        onClick={onActivate}
        aria-pressed={managing ? selected : undefined}
        title={
          managing
            ? `${selected ? '取消选择' : '选择'}${platform}房间 ${entry.roomId}`
            : `重新打开${platform}房间 ${entry.roomId}`
        }
      >
        {managing ? (
          <span className={`history-check${selected ? ' is-checked' : ''}`} aria-hidden="true" />
        ) : null}
        <HistoryThumbnail entry={entry} cover={cover} />
        <span className="history-item-main">
          <span className="history-anchor-name">
            {entry.anchorName || `${platform}主播`}
          </span>
          <strong className="history-room-title">{entry.title || `房间 ${entry.roomId}`}</strong>
          <span className="history-room-id">{roomLabel}</span>
        </span>
        <time dateTime={new Date(entry.visitedAt).toISOString()}>
          {formatHistoryTime(entry.visitedAt)}
        </time>
      </button>

      {!managing ? (
        <button
          type="button"
          className="history-delete"
          onClick={onRemove}
          aria-label={`删除${platform}房间 ${entry.roomId} 的记录`}
          title="删除记录"
        >
          <Icon name="trash" size={14} />
        </button>
      ) : null}
    </div>
  );
}
