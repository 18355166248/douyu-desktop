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

  const dismiss = useCallback((): void => {
    lastProgressAtRef.current = performance.now();
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

    const check = (): void => {
      const now = performance.now();
      const inactive =
        video.paused ||
        video.ended ||
        video.seeking ||
        document.visibilityState === 'hidden';

      if (inactive) {
        lastProgressAtRef.current = now;
        lastTimeRef.current = video.currentTime;
        setStalled(false);
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
    return () => window.clearInterval(timer);
  }, [enabled, videoRef]);

  return { stalled, dismiss };
}
