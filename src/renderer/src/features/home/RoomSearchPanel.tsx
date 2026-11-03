import { useState } from 'react';
import type { RefObject } from 'react';
import type { RoomSearchItem } from '@shared/contracts/search';
import { Icon } from '../../components/Icon';
import { MAX_SEARCH_ROWS, searchRoomMeta, searchRoomSideText } from './homeSearch';

interface RoomSearchRowProps {
  item: RoomSearchItem;
  index: number;
  active: boolean;
  onHighlight: (index: number) => void;
  onSelect: (item: RoomSearchItem) => void;
}

function RoomSearchRow({
  item,
  index,
  active,
  onHighlight,
  onSelect,
}: RoomSearchRowProps): React.JSX.Element {
  const [coverFailed, setCoverFailed] = useState(false);
  const side = searchRoomSideText(item);
  const subtitle = item.title && item.title !== item.name ? item.title : `房间 ${item.roomId}`;

  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      data-search-row={index}
      className={`room-search-row${active ? ' is-active' : ''}`}
      // 输入框失焦会立刻关闭下拉，所以先阻止焦点转移再处理点击。
      onMouseDown={(event) => event.preventDefault()}
      onMouseEnter={() => onHighlight(index)}
      onClick={() => onSelect(item)}
      title={`${searchRoomMeta(item)} · 打开${item.name}`}
    >
      <span className="room-search-thumb">
        {item.cover && !coverFailed ? (
          <img
            src={item.cover}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => setCoverFailed(true)}
          />
        ) : (
          <Icon name="live" size={14} />
        )}
      </span>
      <span className="room-search-copy">
        <span className="room-search-name">
          <strong title={item.name}>{item.name}</strong>
          {item.isLive ? (
            <i className="room-search-badge is-live">LIVE</i>
          ) : item.hasVideo ? (
            <i className="room-search-badge">轮播</i>
          ) : null}
        </span>
        <span className="room-search-subtitle" title={subtitle}>
          {subtitle}
        </span>
      </span>
      {side ? (
        <span className="room-search-side" title={side}>
          {side}
        </span>
      ) : null}
    </button>
  );
}

interface RoomSearchPanelProps {
  items: readonly RoomSearchItem[];
  query: string;
  loading: boolean;
  error: string | null;
  highlighted: number;
  panelRef: RefObject<HTMLDivElement | null>;
  onRetry: () => void;
  onHighlight: (index: number) => void;
  onSelect: (item: RoomSearchItem) => void;
}

/** 顶部房间输入框下方的搜索结果下拉，供输入主播名时选择直播间。 */
export function RoomSearchPanel({
  items,
  query,
  loading,
  error,
  highlighted,
  panelRef,
  onRetry,
  onHighlight,
  onSelect,
}: RoomSearchPanelProps): React.JSX.Element {
  const rows = items.slice(0, MAX_SEARCH_ROWS);
  const overflow = items.length > rows.length;

  return (
    <div
      className="room-search-panel"
      id="room-search-panel"
      role="listbox"
      aria-label="搜索结果"
      ref={panelRef}
    >
      {error ? (
        <div className="room-search-state is-error">
          <Icon name="alert" size={14} />
          <span className="selectable">{error}</span>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onRetry}>
            重试
          </button>
        </div>
      ) : loading ? (
        <div className="room-search-state">
          <Icon name="loading" size={14} className="room-search-spin" />
          <span>正在斗鱼搜索「{query}」…</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="room-search-state">没有找到与「{query}」相关的主播或直播间</div>
      ) : (
        <>
          <div className="room-search-head">
            <span>搜索结果</span>
            <span className="room-search-count">
              {overflow ? `共 ${items.length} 个，显示前 ${rows.length} 个` : `${items.length} 个`}
            </span>
          </div>
          {rows.map((item, index) => (
            <RoomSearchRow
              key={`${item.platform}:${item.roomId}`}
              item={item}
              index={index}
              active={index === highlighted}
              onHighlight={onHighlight}
              onSelect={onSelect}
            />
          ))}
          <div className="room-search-foot">↑↓ 选择 · Enter 打开 · Esc 关闭</div>
        </>
      )}
    </div>
  );
}
