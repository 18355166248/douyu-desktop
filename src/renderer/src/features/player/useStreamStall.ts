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
    const supportsFrames = typeof video.requestVideoFrameCallback === 'function';
    const onFrame = (): void => {
      lastFrameAtRef.current = performance.now();
      frameHandle = video.requestVideoFrameCallback(onFrame);
    };
    if (supportsFrames) frameHandle = video.requestVideoFrameCallback(onFrame);

    const check = (): void => {
      const now = performance.now();
      const inactive =
        video.paused || video.ended || video.seeking || document.visibilityState === 'hidden';

      if (inactive) {
        lastFrameAtRef.current = now;
        lastProgressAtRef.current = now;
        lastTimeRef.current = video.currentTime;
        setStalled(false);
        return;
      }

      if (supportsFrames && hasStreamStalled(now, lastFrameAtRef.current)) {
        setStalled(true);
        return;
      }

      if (Math.abs(video.currentTime - lastTimeRef.current) >= PROGRESS_EPSILON_SECONDS) {
        lastTimeRef.current = video.currentTime;
        lastProgressAtRef.current = now;
        setStalled(false);
        return;
      }

      if (hasStreamStalled(now, lastProgressAtRef.current)) setStalled(true);
    };

    const timer = window.setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
      if (frameHandle !== undefined) video.cancelVideoFrameCallback(frameHandle);
    };
  }, [enabled, videoRef]);

  return { stalled, dismiss };
}
