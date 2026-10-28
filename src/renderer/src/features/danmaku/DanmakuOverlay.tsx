import { useEffect, useLayoutEffect, useRef } from 'react';
import type { DanmakuPlatform, DanmakuStatusEvent } from '@shared/contracts/danmaku';
import { DanmakuEngine } from './DanmakuEngine';
import { GiftFeed } from './GiftFeed';
import type { GiftFeedHandle } from './GiftFeed';
import { useDanmakuSettings } from './DanmakuSettingsContext';
import { useDanmaku } from './useDanmaku';

interface DanmakuOverlayProps {
  roomId: string;
  platform: DanmakuPlatform;
  suspended: boolean;
}

function statusLabel(status: DanmakuStatusEvent): string {
  switch (status.status) {
    case 'connecting':
      return '弹幕连接中…';
    case 'reconnecting':
      return '弹幕重连中…';
    case 'error':
      return status.message ?? '弹幕连接失败';
    case 'disconnected':
      return '弹幕已断开';
    case 'connected':
      return '弹幕已连接';
    default:
      return '弹幕';
  }
}

export function DanmakuOverlay({
  roomId,
  platform,
  suspended,
}: DanmakuOverlayProps): React.JSX.Element {
  const trackRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<DanmakuEngine | null>(null);
  const giftFeedRef = useRef<GiftFeedHandle>(null);
  const { settings, clearToken } = useDanmakuSettings();
  const initialSettingsRef = useRef(settings);
  const status = useDanmaku(roomId, platform, (event) => {
    // 视频没有实际播放时丢弃实时消息，恢复后不补播断流期间的旧弹幕。
    if (suspended) return;
    if (event.kind === 'gift') {
      giftFeedRef.current?.push(event);
      return;
    }
    engineRef.current?.push(event);
  });

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const engine = new DanmakuEngine(track, initialSettingsRef.current);
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.updateSettings({ ...settings, visible: settings.visible && !suspended });
  }, [settings, suspended]);

  useLayoutEffect(() => {
    engineRef.current?.clear();
    giftFeedRef.current?.clear();
  }, [suspended]);

  useEffect(() => {
    engineRef.current?.clear();
  }, [roomId, platform]);

  useEffect(() => {
    if (clearToken > 0) engineRef.current?.clear();
  }, [clearToken]);

  const stateClass = settings.paused ? 'is-paused' : `is-${status.status}`;
  const stateText = settings.paused ? '弹幕已暂停' : statusLabel(status);

  return (
    <div className={`danmaku-layer${settings.visible && !suspended ? '' : ' is-hidden'}`}>
      <div className="danmaku-track" ref={trackRef} aria-hidden="true" />
      <GiftFeed
        key={`${platform}:${roomId}`}
        ref={giftFeedRef}
        settings={settings}
        roomId={roomId}
        platform={platform}
        clearToken={clearToken}
      />
      {settings.paused || status.status !== 'connected' ? (
        <span className={`danmaku-state ${stateClass}`} role="status" aria-live="polite">
          {stateText}
        </span>
      ) : null}
    </div>
  );
}
