import { useEffect, useRef, useState } from 'react';
import type { DanmakuEvent, DanmakuPlatform, DanmakuStatusEvent } from '@shared/contracts/danmaku';
import { errorMessage, unwrap } from '../../lib/api';
import { BilibiliDanmakuClient } from './BilibiliDanmakuClient';
import { DouyuDanmakuClient } from './douyuDanmakuClient';

export function useDanmaku(
  roomId: string,
  platform: DanmakuPlatform,
  onEvent: (event: DanmakuEvent) => void,
): DanmakuStatusEvent {
  const [status, setStatus] = useState<DanmakuStatusEvent>({
    roomId,
    platform,
    status: 'connecting',
  });
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    let active = true;
    let bilibili: BilibiliDanmakuClient | null = null;
    const emit = (event: DanmakuStatusEvent): void => {
      if (active) setStatus(event);
    };
    setStatus({ roomId, platform, status: 'connecting' });

    if (platform === 'bilibili') {
      void window.api.danmaku
        .bilibiliConfig(roomId)
        .then((result) => unwrap(result))
        .then((config) => {
          if (!active) return;
          bilibili = new BilibiliDanmakuClient({
            roomId,
            host: config.host,
            token: config.token,
            refreshConfig: async () => unwrap(await window.api.danmaku.bilibiliConfig(roomId)),
            onEvent: (event) => {
              if (active) onEventRef.current(event);
            },
            onStatus: emit,
          });
          bilibili.connect();
        })
        .catch((error: unknown) => {
          emit({ roomId, platform, status: 'error', message: errorMessage(error) });
        });

      return () => {
        active = false;
        bilibili?.close();
      };
    }

    if (platform === 'douyu') {
      let douyu: DouyuDanmakuClient | null = null;
      void window.api.danmaku
        .douyuConfig()
        .then((result) => unwrap(result))
        .then((config) => {
          if (!active) return;
          douyu = new DouyuDanmakuClient({
            roomId,
            host: config.host,
            onEvent: (event) => {
              if (active) onEventRef.current(event);
            },
            onStatus: emit,
          });
          douyu.connect();
        })
        .catch((error: unknown) => {
          emit({ roomId, platform, status: 'error', message: errorMessage(error) });
        });

      return () => {
        active = false;
        douyu?.close();
      };
    }

    if (platform === 'huya') {
      let subscriptionId: string | null = null;
      let disposed = false;
      const unsubscribe = window.api.danmaku.onHuyaUpdate((update) => {
        if (!active || update.subscriptionId !== subscriptionId) return;
        if (update.status) emit(update.status);
        if (update.event) onEventRef.current(update.event);
      });

      void window.api.danmaku
        .huyaStart(roomId)
        .then((result) => unwrap(result))
        .then((id) => {
          if (disposed) {
            void window.api.danmaku.huyaStop(id);
            return;
          }
          subscriptionId = id;
        })
        .catch((error: unknown) => {
          emit({ roomId, platform, status: 'error', message: errorMessage(error) });
        });

      return () => {
        active = false;
        disposed = true;
        unsubscribe();
        if (subscriptionId) void window.api.danmaku.huyaStop(subscriptionId);
      };
    }

    emit({ roomId, platform, status: 'error', message: '暂不支持该平台弹幕' });
    return () => {
      active = false;
    };
  }, [roomId, platform]);

  return status;
}
