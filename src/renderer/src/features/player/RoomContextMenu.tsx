import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { RoomAudienceSnapshot } from '@shared/contracts/audience';
import type { StreamPlayback } from '@shared/contracts/stream';
import { Icon } from '../../components/Icon';
import { platformLabel } from '../../lib/streamIdentity';
import { useDismissableLayer } from '../../lib/useDismissableLayer';
import { audienceMetricTooltip, formatAudienceValue } from './audienceDisplay';

const MENU_PADDING = 8;

export interface RoomContextMenuProps {
  open: boolean;
  x: number;
  y: number;
  playback: StreamPlayback;
  qualityLabel: string;
  status: string;
  isPlaying: boolean;
  muted: boolean;
  danmakuVisible: boolean;
  danmakuPaused: boolean;
  isReloading: boolean;
  immersive: boolean;
  canSolo: boolean;
  isSolo: boolean;
  audience?: RoomAudienceSnapshot | undefined;
  onClose: () => void;
  onTogglePlayback: () => void;
  onToggleMute: () => void;
  onToggleSolo: () => void;
  onToggleDanmaku: () => void;
  onToggleDanmakuPaused: () => void;
  onReload: () => void;
  onToggleImmersive: () => void;
  onClosePlayer: () => void;
  onReplace: () => void;
}

export function RoomContextMenu({
  open,
  x,
  y,
  playback,
  qualityLabel,
  status,
  isPlaying,
  muted,
  danmakuVisible,
  danmakuPaused,
  isReloading,
  immersive,
  canSolo,
  isSolo,
  audience,
  onClose,
  onTogglePlayback,
  onToggleMute,
  onToggleSolo,
  onToggleDanmaku,
  onToggleDanmakuPaused,
  onReload,
  onToggleImmersive,
  onClosePlayer,
  onReplace,
}: RoomContextMenuProps): React.JSX.Element | null {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useDismissableLayer({ open, onClose, layerRef: menuRef });

  useEffect(() => {
    if (!open) return undefined;

    function handleViewportChange(): void {
      onClose();
    }

    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange);
    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange);
    };
  }, [onClose, open]);

  useLayoutEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    if (!menu) return;

    const rect = menu.getBoundingClientRect();
    setPosition({
      left: Math.max(MENU_PADDING, Math.min(x, window.innerWidth - rect.width - MENU_PADDING)),
      top: Math.max(MENU_PADDING, Math.min(y, window.innerHeight - rect.height - MENU_PADDING)),
    });
  }, [open, x, y]);

  if (!open) return null;

  const anchorName = playback.anchorName?.trim() || `${platformLabel(playback.platform)}主播`;
  const title = playback.title?.trim() || '未提供房间标题';
  const metrics = audience?.metrics.slice(0, 2) ?? [];

  function run(action: () => void): void {
    onClose();
    action();
  }

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (
      event.key !== 'ArrowDown' &&
      event.key !== 'ArrowUp' &&
      event.key !== 'Home' &&
      event.key !== 'End'
    ) {
      return;
    }

    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ??
        [],
    );
    if (items.length === 0) return;

    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex = 0;

    if (event.key === 'End') {
      nextIndex = items.length - 1;
    } else if (event.key === 'ArrowDown') {
      nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
    } else if (event.key === 'ArrowUp') {
      nextIndex =
        currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length;
    }

    items[nextIndex]?.focus();
  }

  return createPortal(
    <div
      ref={menuRef}
      className="room-context-menu"
      style={{ left: position.left, top: position.top }}
      role="menu"
      aria-label="直播间操作与信息"
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={handleMenuKeyDown}
    >
      <div className="room-menu-info">
        <div className="room-menu-eyebrow">
          <span className="room-menu-live">
            <i className="live-dot" />
            LIVE
          </span>
          <span className="room-menu-platform">{platformLabel(playback.platform)}</span>
          <span className="room-menu-status">{status}</span>
        </div>

        <div className="room-menu-anchor" title={anchorName}>
          {anchorName}
        </div>
        <div className="room-menu-room">房间 {playback.roomId}</div>
        <div className="room-menu-title" title={title}>
          {title}
        </div>

        <div className="room-menu-meta">
          <span>{qualityLabel}</span>
          <span>{playback.format.toUpperCase()}</span>
          <span>{muted ? '静音' : '有声'}</span>
          <span>{danmakuVisible ? '弹幕开' : '弹幕关'}</span>
        </div>

        {metrics.length > 0 ? (
          <div className="room-menu-stats">
            {metrics.map((metric) => {
              const { display } = formatAudienceValue(metric.value, metric.isLowerBound);
              return (
                <div
                  key={metric.key}
                  className="room-menu-stat"
                  title={audienceMetricTooltip(metric)}
                >
                  <span>{metric.label}</span>
                  <strong>{display}</strong>
                  <small>{metric.unit}</small>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="room-menu-actions">
        <button
          type="button"
          className="room-menu-item"
          role="menuitem"
          autoFocus
          aria-keyshortcuts="Space"
          onClick={() => run(onTogglePlayback)}
        >
          <Icon name={isPlaying ? 'pause' : 'play'} size={15} />
          <span>{isPlaying ? '暂停播放' : '继续播放'}</span>
          <kbd>Space</kbd>
        </button>

        <button
          type="button"
          className="room-menu-item"
          role="menuitem"
          aria-keyshortcuts="M"
          onClick={() => run(onToggleMute)}
        >
          <Icon name={muted ? 'volumeOff' : 'volume'} size={15} />
          <span>{muted ? '取消静音' : '静音'}</span>
          <kbd>M</kbd>
        </button>

        {canSolo ? (
          <button
            type="button"
            className="room-menu-item"
            role="menuitem"
            aria-keyshortcuts="S"
            onClick={() => run(onToggleSolo)}
          >
            <Icon name="headphones" size={15} />
            <span>{isSolo ? '取消独奏' : '静音其他'}</span>
            <kbd>S</kbd>
          </button>
        ) : null}

        <button
          type="button"
          className="room-menu-item"
          role="menuitem"
          aria-keyshortcuts="D"
          onClick={() => run(onToggleDanmaku)}
        >
          <Icon name={danmakuVisible ? 'eye' : 'eyeOff'} size={15} />
          <span>{danmakuVisible ? '隐藏弹幕' : '显示弹幕'}</span>
          <kbd>D</kbd>
        </button>

        <button
          type="button"
          className="room-menu-item"
          role="menuitem"
          aria-keyshortcuts="P"
          onClick={() => run(onToggleDanmakuPaused)}
        >
          <Icon name={danmakuPaused ? 'play' : 'pause'} size={15} />
          <span>{danmakuPaused ? '继续弹幕' : '暂停弹幕'}</span>
          <kbd>P</kbd>
        </button>

        <div className="room-menu-separator" role="separator" />

        <button
          type="button"
          className="room-menu-item"
          role="menuitem"
          aria-keyshortcuts="R"
          disabled={isReloading}
          onClick={() => run(onReload)}
        >
          <Icon name="refresh" size={15} />
          <span>{isReloading ? '解析中…' : '重新解析'}</span>
          <kbd>R</kbd>
        </button>

        <button
          type="button"
          className="room-menu-item"
          role="menuitem"
          disabled={isReloading}
          onClick={() => run(onReplace)}
        >
          <Icon name="grid" size={15} />
          <span>替换这一路</span>
        </button>

        <button
          type="button"
          className="room-menu-item"
          role="menuitem"
          aria-keyshortcuts="F"
          onClick={() => run(onToggleImmersive)}
        >
          <Icon name={immersive ? 'minimize' : 'expand'} size={15} />
          <span>{immersive ? '退出沉浸' : '进入沉浸'}</span>
          <kbd>F</kbd>
        </button>

        <div className="room-menu-separator" role="separator" />

        <button
          type="button"
          className="room-menu-item is-danger"
          role="menuitem"
          aria-keyshortcuts="X"
          onClick={() => run(onClosePlayer)}
        >
          <Icon name="close" size={15} />
          <span>关闭播放</span>
          <kbd>X</kbd>
        </button>
      </div>
    </div>,
    document.body,
  );
}
