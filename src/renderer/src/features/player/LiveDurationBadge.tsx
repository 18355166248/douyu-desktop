import { useEffect, useState } from 'react';
import type { StreamPlatform } from '@shared/contracts/stream';
import { liveDurationDisplay } from './liveDuration';
import { useRoomLiveStatus } from './useRoomLiveStatus';

interface LiveDurationBadgeProps {
  platform: StreamPlatform;
  roomId: string;
}

/**
 * Shows how long the current session has been running, next to the LIVE pill.
 * The value ticks locally every second and is re-anchored whenever the polled
 * start time changes, so the badge survives an anchor restart.
 */
export function LiveDurationBadge({
  platform,
  roomId,
}: LiveDurationBadgeProps): React.JSX.Element | null {
  const query = useRoomLiveStatus(platform, roomId);
  const live = query.data?.live ?? null;
  const liveSince = query.data?.liveSince ?? null;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (liveSince === null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [liveSince]);

  if (live !== true || liveSince === null) return null;
  const display = liveDurationDisplay(liveSince, now);
  if (!display) return null;

  return (
    <span className="live-duration" title={display.title} aria-label={display.title}>
      {display.display}
    </span>
  );
}
