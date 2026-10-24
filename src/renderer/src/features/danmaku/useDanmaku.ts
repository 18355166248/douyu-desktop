import { useEffect, useRef, useState } from 'react';
import type { DanmakuEvent, DanmakuStatusEvent } from '@shared/contracts/danmaku';
import { DouyuDanmakuClient } from './douyuDanmakuClient';

export function useDanmaku(
  roomId: string,
  onEvent: (event: DanmakuEvent) => void,
): DanmakuStatusEvent {
  const [status, setStatus] = useState<DanmakuStatusEvent>({
    roomId,
    platform: 'douyu',
    status: 'connecting',
  });
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    let active = true;
    setStatus({ roomId, platform: 'douyu', status: 'connecting' });

    const client = new DouyuDanmakuClient({
      roomId,
      onEvent: (event) => {
        if (active) onEventRef.current(event);
      },
      onStatus: (event) => {
        if (active) setStatus(event);
      },
    });

    client.connect();

    return () => {
      active = false;
      client.close();
    };
  }, [roomId]);

  return status;
}
