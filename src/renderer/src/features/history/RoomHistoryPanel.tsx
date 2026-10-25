import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { PLATFORM_ICON_URLS } from '../../lib/platformAssets';
import { platformLabel, roomKey } from '../../lib/streamIdentity';
import { formatHistoryTime, historyLabel } from './roomHistory';
import type { RoomHistoryEntry } from './roomHistory';

interface RoomHistoryPanelProps {
  entries: RoomHistoryEntry[];
  onSelect: (entry: RoomHistoryEntry) => void;
  onRemove: (keys: readonly string[]) => void;
  onClear: () => void;
  onClose: () => void;
}

export function RoomHistoryPanel({
  entries,
  onSelect,
  onRemove,
  onClear,
  onClose,
}: RoomHistoryPanelProps): React.JSX.Element {
  const [isManaging, setManaging] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [isClearArmed, setClearArmed] = useState(false);

  useEffect(() => {
    if (!isClearArmed) return;
    const timer = window.setTimeout(() => setClearArmed(false), 3000);
    return () => window.clearTimeout(timer);
  }, [isClearArmed]);

  const selectedCount = entries.filter((entry) =>
    selectedKeys.has(roomKey(entry.platform, entry.roomId)),
  ).length;
  const allSelected = entries.length > 0 && selectedCount === entries.length;

  const startManaging = (): void => {
    setManaging(true);
    setSelectedKeys(new Set());
    setClearArmed(false);
  };

  const stopManaging = (): void => {
    setManaging(false);
    setSelectedKeys(new Set());
  };

  const toggleSelected = (key: string): void => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = (): void => {
    if (allSelected) {
      setSelectedKeys(new Set());
      return;
    }
    setSelectedKeys(new Set(entries.map((entry) => roomKey(entry.platform, entry.roomId))));
  };

  const removeSelected = (): void => {
    if (selectedCount === 0) return;
    onRemove(
      entries
        .filter((entry) => selectedKeys.has(roomKey(entry.platform, entry.roomId)))
        .map((entry) => roomKey(entry.platform, entry.roomId)),
    );
    setSelectedKeys(new Set());
    if (selectedCount === entries.length) setManaging(false);
  };

  const handleClear = (): void => {
    if (!isClearArmed) {
      setClearArmed(true);
      return;
    }
    onClear();
    setClearArmed(false);
  };

  return (
    <section id="room-history-panel" className="history-panel" role="dialog" aria-label="访问历史">
      <header className="history-head">
        <div>
          <strong>{isManaging ? `已选 ${selectedCount} 条` : '访问历史'}</strong>
          <small>
            {isManaging ? `共 ${entries.length} 条，点击记录选择` : '全局保存 · 最近访问优先'}
          </small>
        </div>
        <div className="history-actions">
          {isManaging ? (
            <>
              <button
                type="button"
                className="history-tool"
                onClick={toggleSelectAll}
                disabled={entries.length === 0}
                title={allSelected ? '取消选择全部记录' : '选择全部记录'}
              >
                {allSelected ? '取消全选' : '全选'}
              </button>
              <button
                type="button"
                className="history-bulk-delete"
                onClick={removeSelected}
                disabled={selectedCount === 0}
                title="删除已选记录"
              >
                {selectedCount > 0 ? `删除 ${selectedCount}` : '删除'}
              </button>
              <button type="button" className="history-tool" onClick={stopManaging}>
                取消
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="history-manage"
                onClick={startManaging}
                disabled={entries.length === 0}
                title="批量选择历史记录"
              >
                管理
              </button>
              <button
                type="button"
                className={`history-clear${isClearArmed ? ' is-armed' : ''}`}
                onClick={handleClear}
                disabled={entries.length === 0}
                title={isClearArmed ? '再次点击确认清空全部记录' : '清空全部历史记录'}
              >
                {isClearArmed ? '确认清空' : '清空'}
              </button>
            </>
          )}
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
            <small>播放过的房间会出现在这里，历史不随卸载丢失</small>
          </div>
        ) : (
          entries.map((entry) => {
            const key = roomKey(entry.platform, entry.roomId);
            const selected = selectedKeys.has(key);
            return (
              <div
                key={key}
                className={`history-item${isManaging ? ' is-managing' : ''}${
                  selected ? ' is-selected' : ''
                }`}
              >
                <button
                  type="button"
                  className="history-item-open"
                  onClick={() => (isManaging ? toggleSelected(key) : onSelect(entry))}
                  aria-pressed={isManaging ? selected : undefined}
                  title={
                    isManaging
                      ? `${selected ? '取消选择' : '选择'}${platformLabel(entry.platform)}房间 ${
                          entry.roomId
                        }`
                      : `重新打开${platformLabel(entry.platform)}房间 ${entry.roomId}`
                  }
                >
                  {isManaging ? (
                    <span
                      className={`history-check${selected ? ' is-checked' : ''}`}
                      aria-hidden="true"
                    />
                  ) : null}
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
                  <span className="history-item-main">
                    <span className="history-anchor-name">
                      {entry.anchorName || `${platformLabel(entry.platform)}主播`}
                    </span>
                    <strong className="history-room-title">
                      {entry.title || `房间 ${entry.roomId}`}
                    </strong>
                    <span className="history-room-id">{historyLabel(entry)}</span>
                  </span>
                  <time dateTime={new Date(entry.visitedAt).toISOString()}>
                    {formatHistoryTime(entry.visitedAt)}
                  </time>
                </button>

                {!isManaging ? (
                  <button
                    type="button"
                    className="history-delete"
                    onClick={() => onRemove([key])}
                    aria-label={`删除${platformLabel(entry.platform)}房间 ${entry.roomId} 的记录`}
                    title="删除记录"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
