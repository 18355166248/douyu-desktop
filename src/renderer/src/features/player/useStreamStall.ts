import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { hasStreamStalled } from './streamStall';

const CHECK_INTERVAL_MS = 1_000;
const PROGRESS_EPSILON_SECONDS = 0.05;

export interface StreamStallState {
  stalled: boolean;
  dismiss: () => void;
}

export function useStreamStall(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  userPausedRef?: RefObject<boolean>,
  observeFrames = true,
): StreamStallState {
  const [stalled, setStalled] = useState(false);
  const lastProgressAtRef = useRef(0);
  const lastTimeRef = useRef(0);
  const lastFrameAtRef = useRef(0);

  const dismiss = useCallback((): void => {
    lastProgressAtRef.current = performance.now();
    lastFrameAtRef.current = lastProgressAtRef.current;
    setStalled(false);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !enabled) {
      setStalled(false);
      return undefined;
    }

    lastProgressAtRef.current = performance.now();
    lastTimeRef.current = video.currentTime;
    setStalled(false);

    // currentTime 可能随音轨继续前进；以实际提交的视频帧检测“有声无画”。
    lastFrameAtRef.current = performance.now();
    let frameHandle: number | undefined;
    const supportsFrames = observeFrames && typeof video.requestVideoFrameCallback === 'function';
    const onFrame = (): void => {
      lastFrameAtRef.current = performance.now();
      frameHandle = video.requestVideoFrameCallback(onFrame);
    };
    if (supportsFrames) frameHandle = video.requestVideoFrameCallback(onFrame);

    // 后台的定时器可能完全不执行，不能依赖 check() 在不可见期间重置时钟。
    const resetObservation = (): void => {
      lastTimeRef.current = video.currentTime;
      dismiss();
    };
    document.addEventListener('visibilitychange', resetObservation);
    video.addEventListener('play', resetObservation);
    video.addEventListener('emptied', resetObservation);

    const check = (): void => {
      const now = performance.now();
      const inactive =
        (userPausedRef ? userPausedRef.current : video.paused) ||
        document.visibilityState === 'hidden';

      if (inactive) {
        lastFrameAtRef.current = now;
        lastProgressAtRef.current = now;
        lastTimeRef.current = video.currentTime;
        setStalled(false);
        return;
      }

      // 首帧需要更多连接时间，但不能因 paused/未加载元数据而永远跳过恢复。
      const timeout = video.readyState === 0 ? 20_000 : undefined;
      if (supportsFrames && hasStreamStalled(now, lastFrameAtRef.current, timeout)) {
        setStalled(true);
        return;
      }

      if (Math.abs(video.currentTime - lastTimeRef.current) >= PROGRESS_EPSILON_SECONDS) {
        lastTimeRef.current = video.currentTime;
        lastProgressAtRef.current = now;
        setStalled(false);
        return;
      }

      if (hasStreamStalled(now, lastProgressAtRef.current, timeout)) setStalled(true);
    };

    const timer = window.setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', resetObservation);
      video.removeEventListener('play', resetObservation);
      video.removeEventListener('emptied', resetObservation);
      if (frameHandle !== undefined) video.cancelVideoFrameCallback(frameHandle);
    };
  }, [dismiss, enabled, observeFrames, videoRef, userPausedRef]);

  return { stalled, dismiss };
}
