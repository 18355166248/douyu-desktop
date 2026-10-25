import { useCallback, useEffect, useRef, useState } from 'react';
import type { StreamPlayback, StreamQuality } from '@shared/contracts/stream';
import { Icon } from '../../components/Icon';
import { isEditableTarget, isInteractiveTarget } from '../../lib/keyboard';
import { usePlatformLoginStatus } from '../accounts/usePlatformLogin';
import { DanmakuOverlay } from '../danmaku/DanmakuOverlay';
import { useDanmakuSettings } from '../danmaku/DanmakuSettingsContext';
import { qualityOptionsFor } from './streamQuality';
import { STALL_TIMEOUT_MS } from './streamStall';
import { attachPlayback } from './playbackSession';
import { useAutoHideControls } from './useAutoHideControls';
import { useStreamStall } from './useStreamStall';
import type { StreamResolveOptions } from './useStreamGrid';

interface VideoPlayerProps {
  playback: StreamPlayback;
  muted: boolean;
  volume: number;
  quality: StreamQuality;
  preferHls: boolean;
  isReloading: boolean;
  shortcutsEnabled: boolean;
  onReload: () => void;
  onToggleMute: () => void;
  onVolumeChange: (volume: number) => void;
  onOptionsChange: (patch: Partial<StreamResolveOptions>) => void;
  onOpenDanmakuSettings: () => void;
  onStop: () => void;
}

export function VideoPlayer({
  playback,
  muted,
  volume,
  quality,
  preferHls,
  isReloading,
  shortcutsEnabled,
  onReload,
  onToggleMute,
  onVolumeChange,
  onOptionsChange,
  onOpenDanmakuSettings,
  onStop,
}: VideoPlayerProps): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const userPausedRef = useRef(false);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controls = useAutoHideControls();
  const showControls = controls.show;
  const { settings, update } = useDanmakuSettings();
  const stall = useStreamStall(videoRef, isReady && !error && !isReloading);
  const qualityOptions = qualityOptionsFor(playback.platform);
  const bilibiliLogin = usePlatformLoginStatus('bilibili', playback.platform === 'bilibili');
  const needsBilibiliLogin =
    playback.platform === 'bilibili' && bilibiliLogin.data?.loggedIn === false;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    setError(null);
    setIsReady(false);
    setIsPlaying(false);
    userPausedRef.current = false;
    return attachPlayback(video, playback, {
      isUserPaused: () => userPausedRef.current,
      onError: setError,
    });
  }, [playback]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) video.muted = muted;
  }, [muted]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) video.volume = Math.min(1, Math.max(0, volume));
  }, [volume]);

  const togglePlayback = useCallback((): void => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      userPausedRef.current = false;
      void video.play().catch(() => {
        // Autoplay rejection is surfaced by the loading/error state.
      });
    } else {
      userPausedRef.current = true;
      video.pause();
    }
  }, []);

  useEffect(() => {
    if (!shortcutsEnabled) return undefined;

    function handleKeyDown(event: KeyboardEvent): void {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.isComposing ||
        isEditableTarget(event.target)
      ) {
        return;
      }

      const target = event.target;
      const key = event.key;

      if (key === ' ' || key === 'Spacebar' || key === 'Space') {
        if (isInteractiveTarget(target)) return;
        event.preventDefault();
        togglePlayback();
        showControls();
        return;
      }

      if (key === 'ArrowUp' || key === 'ArrowDown') {
        if (isInteractiveTarget(target)) return;
        event.preventDefault();
        const next = Math.min(1, Math.max(0, volume + (key === 'ArrowUp' ? 0.05 : -0.05)));
        if (muted && next > 0) onToggleMute();
        onVolumeChange(next);
        showControls();
        return;
      }

      switch (key.toLowerCase()) {
        case 'm':
          event.preventDefault();
          onToggleMute();
          showControls();
          break;
        case 'r':
          if (isReloading) return;
          event.preventDefault();
          onReload();
          showControls();
          break;
        case 'd':
          event.preventDefault();
          update({ visible: !settings.visible });
          showControls();
          break;
        case 'p':
          event.preventDefault();
          update({ paused: !settings.paused });
          showControls();
          break;
        case 'x':
          event.preventDefault();
          onStop();
          break;
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    isReloading,
    muted,
    onReload,
    onStop,
    onToggleMute,
    onVolumeChange,
    settings.paused,
    settings.visible,
    shortcutsEnabled,
    showControls,
    togglePlayback,
    volume,
    update,
  ]);

  return (
    <div
      className="video-shell"
      onPointerEnter={controls.show}
      onPointerMove={controls.show}
      onPointerLeave={controls.hide}
      onFocusCapture={controls.reveal}
      onBlurCapture={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        controls.scheduleHide();
      }}
    >
      <video
        ref={videoRef}
        className="video"
        autoPlay
        muted={muted}
        playsInline
        preload="auto"
        controls={false}
        onLoadedMetadata={() => setIsReady(true)}
        onCanPlay={() => setIsReady(true)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onError={() => setError('视频加载失败，请重新解析')}
      />

      <div
        className={`video-topline${controls.visible ? ' is-visible' : ''}`}
        aria-hidden={!controls.visible}
      >
        <span className="live-pill">
          <i className="live-dot" />
          LIVE
        </span>
        <span className="video-room">ROOM {playback.roomId}</span>
      </div>

      <div
        className={`video-bottom-fade${controls.visible ? ' is-visible' : ''}`}
        aria-hidden="true"
      />

      <DanmakuOverlay roomId={playback.roomId} platform={playback.platform} />

      {stall.stalled ? (
        <div className="video-stall" role="alert" aria-live="assertive">
          <span className="video-stall-icon" aria-hidden="true">
            <Icon name="alert" size={18} />
          </span>
          <div className="video-stall-copy">
            <strong>直播可能卡住了</strong>
            <span>画面已超过 {STALL_TIMEOUT_MS / 1000} 秒没有更新</span>
          </div>
          <div className="video-stall-actions">
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                stall.dismiss();
                onReload();
              }}
              disabled={isReloading}
            >
              重新加载
            </button>
            <button type="button" className="btn ghost" onClick={stall.dismiss}>
              继续等待
            </button>
          </div>
        </div>
      ) : null}

      {!isReady && !error ? (
        <div className="video-loading">
          <span className="spinner" />
          正在连接直播流…
        </div>
      ) : null}

      {error ? (
        <div className="video-error selectable">
          <Icon name="alert" size={24} />
          <strong>{error}</strong>
          <span>可以尝试重新解析，或切换 HLS 模式。</span>
        </div>
      ) : null}

      <div
        className={`video-bottomline${controls.visible ? ' is-visible' : ''}`}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="icon-btn video-playback-toggle"
          onClick={togglePlayback}
          aria-label={isPlaying ? '暂停播放' : '继续播放'}
          aria-keyshortcuts="Space"
          title={isPlaying ? '暂停播放 (Space)' : '继续播放 (Space)'}
        >
          <Icon name={isPlaying ? 'pause' : 'play'} size={17} />
        </button>
        <div className="video-volume">
          <button
            type="button"
            className="icon-btn"
            onClick={onToggleMute}
            aria-label={muted ? '取消静音' : '静音'}
            aria-keyshortcuts="M"
            title={muted ? '取消静音 (M)' : '静音 (M)'}
          >
            <Icon name={muted ? 'volumeOff' : 'volume'} size={18} />
          </button>
          <input
            className="volume-range"
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(volume * 100)}
            onChange={(event) => onVolumeChange(Number(event.target.value) / 100)}
            aria-label="音量"
            aria-valuetext={`${Math.round(volume * 100)}%`}
            aria-keyshortcuts="ArrowUp ArrowDown"
            title={`音量 ${Math.round(volume * 100)}%（↑ / ↓）`}
          />
          <span className="video-sound">{muted ? '已静音' : `${Math.round(volume * 100)}%`}</span>
        </div>

        <span className="video-divider" aria-hidden="true" />

        <button
          type="button"
          className={`icon-btn video-danmaku-button${settings.visible ? '' : ' is-off'}`}
          onClick={() => update({ visible: !settings.visible })}
          aria-label={settings.visible ? '隐藏弹幕' : '显示弹幕'}
          aria-keyshortcuts="D"
          aria-pressed={settings.visible}
          title={settings.visible ? '隐藏弹幕 (D)' : '显示弹幕 (D)'}
        >
          <Icon name={settings.visible ? 'eye' : 'eyeOff'} size={17} />
        </button>
        <button
          type="button"
          className={`icon-btn video-danmaku-button video-pause-button${settings.paused ? ' is-off' : ''}`}
          onClick={() => update({ paused: !settings.paused })}
          aria-label={settings.paused ? '继续弹幕' : '暂停弹幕'}
          aria-keyshortcuts="P"
          aria-pressed={settings.paused}
          title={settings.paused ? '继续弹幕 (P)' : '暂停弹幕 (P)'}
        >
          <Icon name={settings.paused ? 'play' : 'pause'} size={17} />
        </button>

        <div className="video-playback-controls">
          <label className="video-select-wrap">
            <span className="sr-only">画质</span>
            <select
              className="video-select"
              value={quality}
              onChange={(event) =>
                onOptionsChange({ quality: event.target.value as StreamQuality })
              }
              disabled={isReloading}
              aria-label="画质"
              title={
                needsBilibiliLogin ? 'B站高画质需要登录，请点右上角登录' : '切换画质并重新解析'
              }
            >
              {qualityOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {needsBilibiliLogin ? (
            <span className="video-login-hint" title="点击右上角登录 B 站">
              登录解锁高画质
            </span>
          ) : null}
          <button
            type="button"
            className={`video-hls${preferHls ? ' is-on' : ''}`}
            onClick={() => onOptionsChange({ preferHls: !preferHls })}
            disabled={isReloading}
            aria-pressed={preferHls}
            title={`优先使用 HLS（当前 ${playback.format.toUpperCase()}）`}
          >
            HLS
          </button>
          <button
            type="button"
            className="icon-btn video-settings-button"
            onClick={onOpenDanmakuSettings}
            aria-label="弹幕设置"
            title="弹幕设置"
          >
            <Icon name="settings" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
