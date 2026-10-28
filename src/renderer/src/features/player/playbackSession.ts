import type Hls from 'hls.js';
import type mpegts from 'mpegts.js';
import type { StreamPlayback } from '@shared/contracts/stream';

interface PlaybackSessionOptions {
  isUserPaused: () => boolean;
  onError: (message: string) => void;
  onRecovering?: () => void;
}

/** Owns one media element attachment, including deferred imports and all retries. */
export function attachPlayback(
  video: HTMLVideoElement,
  playback: StreamPlayback,
  options: PlaybackSessionOptions,
): () => void {
  let disposed = false;
  let failed = false;
  let hls: Hls | null = null;
  let flv: ReturnType<typeof mpegts.createPlayer> | null = null;
  let recoveryAttempts = 0;
  let recoverNativeError: (() => void) | null = null;
  let healthySince: number | null = null;
  let recoveryTimer: ReturnType<typeof setTimeout> | null = null;

  const play = (): void => {
    if (disposed || failed || options.isUserPaused()) return;
    void video.play().catch(() => {
      // canplay/loadeddata will retry without overriding a user pause.
    });
  };
  const resumeWhenReady = (): void => {
    if (video.paused) play();
  };
  const resetHealthyWindow = (): void => {
    healthySince = null;
  };
  const trackPlayback = (): void => {
    if (video.paused || video.seeking) {
      resetHealthyWindow();
      return;
    }
    healthySince ??= video.currentTime;
    // A parsed manifest says nothing about whether its segments are playable.
    // Only replenish the retry budget after media has actually advanced.
    if (video.currentTime - healthySince >= 10) recoveryAttempts = 0;
  };
  const destroyPlayers = (): void => {
    const currentHls = hls;
    hls = null;
    currentHls?.destroy();
    const currentFlv = flv;
    flv = null;
    if (currentFlv) {
      currentFlv.pause();
      currentFlv.unload();
      currentFlv.detachMediaElement();
      currentFlv.destroy();
    }
  };
  const fail = (message: string): void => {
    if (disposed || failed) return;
    failed = true;
    for (const timer of retryTimers) clearTimeout(timer);
    if (recoveryTimer !== null) clearTimeout(recoveryTimer);
    recoveryTimer = null;
    destroyPlayers();
    options.onError(message);
  };

  // 原生解码错误与播放器错误共用同一恢复预算，避免 UI 抢先重新解析打断内部恢复。
  const onNativeError = (): void => {
    if (disposed || failed || !video.error) return;
    if (recoverNativeError) recoverNativeError();
    else fail('视频加载失败，请重新解析');
  };
  video.addEventListener('error', onNativeError);
  video.addEventListener('canplay', resumeWhenReady);
  video.addEventListener('loadeddata', resumeWhenReady);
  video.addEventListener('timeupdate', trackPlayback);
  video.addEventListener('waiting', resetHealthyWindow);
  video.addEventListener('seeking', resetHealthyWindow);
  const retryTimers = [800, 2_000, 4_000].map((delay) => setTimeout(resumeWhenReady, delay));

  const start = async (): Promise<void> => {
    if (playback.format === 'hls' || playback.url.includes('.m3u8')) {
      const { default: Hls } = await import('hls.js');
      if (disposed || failed) return;
      if (Hls.isSupported()) {
        hls = new Hls({ enableWorker: true, lowLatencyMode: true, backBufferLength: 30 });
        hls.on(Hls.Events.MANIFEST_PARSED, play);
        let pendingRecoveryType: string | null = null;
        const recoverHls = (type: string): void => {
          if (disposed || failed || !hls) return;
          resetHealthyWindow();
          if (type !== Hls.ErrorTypes.NETWORK_ERROR && type !== Hls.ErrorTypes.MEDIA_ERROR) {
            fail('HLS 播放失败，请尝试重新解析');
            return;
          }
          if (recoveryTimer !== null) {
            // A media element error must rebuild MSE; a manifest reload alone cannot fix it.
            if (type === Hls.ErrorTypes.MEDIA_ERROR) pendingRecoveryType = type;
            return;
          }
          if (recoveryAttempts >= 3) {
            fail('HLS 播放失败，请重新解析');
            return;
          }
          options.onRecovering?.();
          recoveryAttempts += 1;
          pendingRecoveryType = type;
          recoveryTimer = setTimeout(() => {
            recoveryTimer = null;
            const recoveryType = pendingRecoveryType;
            pendingRecoveryType = null;
            if (disposed || failed || !hls) return;
            try {
              if (recoveryType === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
              else {
                hls.loadSource(playback.url);
                hls.startLoad();
              }
            } catch {
              fail('HLS 重连失败，请重新解析');
            }
          }, 400 * recoveryAttempts);
        };
        recoverNativeError = () => recoverHls(Hls.ErrorTypes.MEDIA_ERROR);
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) recoverHls(data.type);
        });
        hls.loadSource(playback.url);
        hls.attachMedia(video);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = playback.url;
        play();
      } else fail('当前环境不支持 HLS');
    } else {
      const { default: mpegts } = await import('mpegts.js');
      if (disposed || failed) return;
      if (!mpegts.isSupported()) {
        fail('当前环境不支持 FLV');
        return;
      }
      const connectFlv = (): void => {
        if (disposed || failed) return;
        // 重连时重建 MSE，避免把新连接的时间戳接到旧音视频缓冲上。
        destroyPlayers();
        const player = mpegts.createPlayer(
          { type: 'flv', isLive: true, url: playback.url },
          {
            enableWorker: true,
            // 直播稳定性优先：保留网络抖动缓冲，单位为字节。
            enableStashBuffer: true,
            stashInitialSize: 128 * 1024,
            // 暂停或卡顿后限制本地积压，避免视频一直落后于实时弹幕；不在暂停时追帧。
            liveBufferLatencyChasing: true,
            liveBufferLatencyMaxLatency: 8,
            liveBufferLatencyMinRemain: 2,
            lazyLoad: false,
            autoCleanupSourceBuffer: true,
          },
        );
        flv = player;
        const reconnect = (): void => {
          if (disposed || failed || flv !== player || recoveryTimer !== null) return;
          resetHealthyWindow();
          if (recoveryAttempts >= 3) {
            fail('FLV 播放失败，请尝试重新解析');
            return;
          }
          options.onRecovering?.();
          recoveryAttempts += 1;
          recoveryTimer = setTimeout(() => {
            recoveryTimer = null;
            try {
              connectFlv();
            } catch {
              fail('FLV 重连失败，请重新解析');
            }
          }, 400 * recoveryAttempts);
        };
        recoverNativeError = reconnect;
        player.attachMediaElement(video);
        player.on(mpegts.Events.ERROR, reconnect);
        // 直播连接正常 EOF 也意味着后续没有数据，不能只监听 ERROR。
        player.on(mpegts.Events.LOADING_COMPLETE, reconnect);
        player.load();
        play();
      };
      connectFlv();
    }
  };
  void start().catch(() => fail('播放器初始化失败，请重新解析'));

  return () => {
    disposed = true;
    for (const timer of retryTimers) clearTimeout(timer);
    if (recoveryTimer !== null) clearTimeout(recoveryTimer);
    video.removeEventListener('error', onNativeError);
    video.removeEventListener('canplay', resumeWhenReady);
    video.removeEventListener('loadeddata', resumeWhenReady);
    video.removeEventListener('timeupdate', trackPlayback);
    video.removeEventListener('waiting', resetHealthyWindow);
    video.removeEventListener('seeking', resetHealthyWindow);
    destroyPlayers();
    video.removeAttribute('src');
    video.load();
  };
}
