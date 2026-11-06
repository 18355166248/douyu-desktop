import { useEffect, useRef, useState } from 'react';
import type { DanmakuEvent, DanmakuPlatform, DanmakuStatusEvent } from '@shared/contracts/danmaku';
import { errorMessage, unwrap } from '../../lib/api';
import { BilibiliDanmakuClient } from './BilibiliDanmakuClient';
import { DouyuDanmakuClient } from './douyuDanmakuClient';

export function useDanmaku(
  roomId: string,
  platform: DanmakuPlatform,
  onEvent: (event: DanmakuEvent) => void,
  reconnectToken = 0,
  onResetQueue?: () => void,
): DanmakuStatusEvent {
  const [status, setStatus] = useState<DanmakuStatusEvent>({
    roomId,
    platform,
    status: 'connecting',
  });
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const resetRef = useRef(onResetQueue);
  resetRef.current = onResetQueue;
  const revisionRef = useRef(reconnectToken);
  revisionRef.current = reconnectToken;

  useEffect(() => {
    let active = true;
    const isCurrent = (): boolean => active && revisionRef.current === reconnectToken;
    let lastStatus: DanmakuStatusEvent['status'] = 'connecting';
    resetRef.current?.();
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const stopRetries = (): void => {
      active = false;
      clearTimeout(retryTimer);
    };
    let bilibili: BilibiliDanmakuClient | null = null;
    const emit = (event: DanmakuStatusEvent): void => {
      if (!isCurrent()) return;
      if (lastStatus !== event.status) resetRef.current?.();
      lastStatus = event.status;
      setStatus(event);
    };
    setStatus({ roomId, platform, status: 'connecting' });

    const startWithRetry = (start: () => Promise<void>, attempt = 0): void => {
      if (!isCurrent()) return;
      void start().catch((error: unknown) => {
        if (!isCurrent()) return;
        const delay = [1_000, 3_000, 8_000][attempt];
        if (delay === undefined) {
          emit({ roomId, platform, status: 'error', message: errorMessage(error) });
          return;
        }
        emit({
          roomId,
          platform,
          status: 'reconnecting',
          message: `弹幕连接失败，正在重试（${attempt + 1}/3）`,
        });
        retryTimer = setTimeout(() => startWithRetry(start, attempt + 1), delay);
      });
    };

    if (platform === 'bilibili') {
      startWithRetry(() =>
        window.api.danmaku
          .bilibiliConfig(roomId)
          .then((result) => unwrap(result))
          .then((config) => {
            if (!isCurrent()) return;
            bilibili = new BilibiliDanmakuClient({
              roomId,
              host: config.host,
              token: config.token,
              refreshConfig: async () => unwrap(await window.api.danmaku.bilibiliConfig(roomId)),
              onEvent: (event) => {
                if (isCurrent()) onEventRef.current(event);
              },
              onStatus: emit,
            });
            bilibili.connect();
          }),
      );

      return () => {
        stopRetries();
        bilibili?.close();
      };
    }

    if (platform === 'douyu') {
      let douyu: DouyuDanmakuClient | null = null;
      startWithRetry(() =>
        window.api.danmaku
          .douyuConfig()
          .then((result) => unwrap(result))
          .then((config) => {
            if (!isCurrent()) return;
            douyu = new DouyuDanmakuClient({
              roomId,
              host: config.host,
              onEvent: (event) => {
                if (isCurrent()) onEventRef.current(event);
              },
              onStatus: emit,
            });
            douyu.connect();
          }),
      );

      return () => {
        stopRetries();
        douyu?.close();
      };
    }

    if (platform === 'huya') {
      let subscriptionId: string | null = null;
      let disposed = false;
      const unsubscribe = window.api.danmaku.onHuyaUpdate((update) => {
        if (!isCurrent() || update.subscriptionId !== subscriptionId) return;
        if (update.status) emit(update.status);
        if (update.event) onEventRef.current(update.event);
      });

      startWithRetry(() =>
        window.api.danmaku
          .huyaStart(roomId)
          .then((result) => unwrap(result))
          .then((id) => {
            if (disposed) {
              void window.api.danmaku.huyaStop(id);
              return;
            }
            subscriptionId = id;
          }),
      );

      return () => {
        stopRetries();
        disposed = true;
        unsubscribe();
        if (subscriptionId) void window.api.danmaku.huyaStop(subscriptionId);
      };
    }

    emit({ roomId, platform, status: 'error', message: '暂不支持该平台弹幕' });
    return () => {
      active = false;
    };
  }, [roomId, platform, reconnectToken]);

  return status;
}
