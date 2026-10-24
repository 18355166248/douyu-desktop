import { Icon } from '../../components/Icon';
import { formatHistoryTime } from './roomHistory';
import type { RoomHistoryEntry } from './roomHistory';

interface RoomHistoryPanelProps {
  entries: RoomHistoryEntry[];
  onSelect: (roomId: string) => void;
  onClear: () => void;
  onClose: () => void;
}

export function RoomHistoryPanel({
  entries,
  onSelect,
  onClear,
  onClose,
}: RoomHistoryPanelProps): React.JSX.Element {
  return (
    <section id="room-history-panel" className="history-panel" role="dialog" aria-label="访问历史">
      <header className="history-head">
        <div>
          <strong>访问历史</strong>
          <small>按最近访问时间排序</small>
        </div>
        <div className="history-actions">
          <button
            type="button"
            className="history-clear"
            onClick={onClear}
            disabled={entries.length === 0}
          >
            清空
          </button>
          <button
            type="button"
            className="history-close"
            onClick={onClose}
            aria-label="关闭访问历史"
            title="关闭"
          >
            <Icon name="close" size={13} />
          </button>
        </div>
      </header>

      <div className="history-list">
        {entries.length === 0 ? (
          <div className="history-empty">
            <Icon name="history" size={22} />
            <span>还没有访问记录</span>
            <small>播放过的房间会按时间出现在这里</small>
          </div>
        ) : (
          entries.map((entry) => (
            <button
              key={entry.roomId}
              type="button"
              className="history-item"
              onClick={() => onSelect(entry.roomId)}
              title={`重新打开房间 ${entry.roomId}`}
            >
              <span className="history-item-main">
                <span className="history-anchor-name">{entry.anchorName || '斗鱼主播'}</span>
                <strong className="history-room-title">
                  {entry.title || `房间 ${entry.roomId}`}
                </strong>
                <span className="history-room-id">房间 {entry.roomId}</span>
              </span>
              <time dateTime={new Date(entry.visitedAt).toISOString()}>
                {formatHistoryTime(entry.visitedAt)}
              </time>
              <span className="history-open" aria-hidden="true">
                <Icon name="play" size={12} />
              </span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}
