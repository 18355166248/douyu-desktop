import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import mpegts from 'mpegts.js';
import type { StreamPlayback } from '@shared/contracts/stream';
import { Icon } from '../../components/Icon';

interface VideoPlayerProps {
  playback: StreamPlayback;
}

export function VideoPlayer({ playback }: VideoPlayerProps): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    let disposed = false;
    let hls: Hls | null = null;
    let flv: ReturnType<typeof mpegts.createPlayer> | null = null;
    const fail = (message: string): void => {
      if (!disposed) setError(message);
    };

    setError(null);
    setIsReady(false);
    video.muted = true;
    setIsMuted(true);

    const play = (): void => {
      void Promise.resolve(video.play()).catch(() => {
        // Autoplay policy can still reject; muted playback usually succeeds.
      });
    };

    if (playback.format === 'hls' || playback.url.includes('.m3u8')) {
      if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 30,
        });
        hls.loadSource(playback.url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, play);
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal || !hls) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            fail('HLS 播放失败，请尝试重新解析');
            hls.destroy();
            hls = null;
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = playback.url;
        play();
      } else {
        fail('当前环境不支持 HLS');
      }
    } else if (mpegts.isSupported()) {
      flv = mpegts.createPlayer(
        {
          type: 'flv',
          isLive: true,
          url: playback.url,
        },
        {
          enableWorker: true,
          enableStashBuffer: false,
          stashInitialSize: 128,
          lazyLoad: false,
          autoCleanupSourceBuffer: true,
        },
      );
      flv.attachMediaElement(video);
      flv.on(mpegts.Events.ERROR, () => {
        fail('FLV 播放失败，请尝试重新解析');
      });
      flv.load();
      void Promise.resolve(flv.play()).catch(() => {
        // Keep the error overlay clean; video element will report if it is fatal.
      });
    } else {
      fail('当前环境不支持 FLV');
    }

    return () => {
      disposed = true;
      if (hls) hls.destroy();
      if (flv) {
        flv.pause();
        flv.unload();
        flv.detachMediaElement();
        flv.destroy();
      }
      video.removeAttribute('src');
      video.load();
    };
  }, [playback.format, playback.url]);

  const toggleMute = (): void => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  return (
    <div className="video-shell">
      <video
        ref={videoRef}
        className="video"
        autoPlay
        muted
        playsInline
        preload="auto"
        controls={false}
        onLoadedMetadata={() => setIsReady(true)}
        onCanPlay={() => setIsReady(true)}
        onError={() => setError('视频加载失败，请重新解析')}
        onClick={() => {
          const video = videoRef.current;
          if (!video) return;
          if (video.paused) void video.play();
          else video.pause();
        }}
      />

      <div className="video-topline">
        <span className="live-pill">
          <i className="live-dot" />
          LIVE
        </span>
        <span className="video-room">ROOM {playback.roomId}</span>
      </div>

      {!isReady && !error ? (
        <div className="video-loading">
          <span className="spinner" />
          正在连接直播流…
        </div>
      ) : null}

      {error ? (
        <div className="video-error">
          <Icon name="alert" size={24} />
          <strong>{error}</strong>
          <span>可以尝试重新解析，或切换 HLS 模式。</span>
        </div>
      ) : null}

      <div className="video-bottomline" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="icon-btn"
          onClick={toggleMute}
          aria-label={isMuted ? '取消静音' : '静音'}
        >
          <Icon name={isMuted ? 'volumeOff' : 'volume'} size={18} />
        </button>
        <span className="video-sound">{isMuted ? '已静音' : '声音开启'}</span>
        <span className="video-quality">{playback.quality}</span>
      </div>
    </div>
  );
}
