import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_HIDE_DELAY_MS = 4000;

export interface AutoHideControls {
  visible: boolean;
  reveal: () => void;
  show: () => void;
  scheduleHide: () => void;
  hide: () => void;
}

export function useAutoHideControls(delay = DEFAULT_HIDE_DELAY_MS): AutoHideControls {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<number | null>(null);

  const cancelHide = useCallback((): void => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback((): void => {
    cancelHide();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setVisible(false);
    }, delay);
  }, [cancelHide, delay]);

  const reveal = useCallback((): void => {
    cancelHide();
    setVisible(true);
  }, [cancelHide]);

  const show = useCallback((): void => {
    reveal();
    scheduleHide();
  }, [reveal, scheduleHide]);

  const hide = useCallback((): void => {
    cancelHide();
    setVisible(false);
  }, [cancelHide]);

  useEffect(() => cancelHide, [cancelHide]);

  return { visible, reveal, show, scheduleHide, hide };
}
