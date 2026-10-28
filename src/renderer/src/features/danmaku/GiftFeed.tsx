import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import type { DanmakuEvent } from '@shared/contracts/danmaku';
import { Icon } from '../../components/Icon';
import type { DanmakuSettings } from './danmakuSettings';
import { giftTier, giftVisible } from './giftTier';
import type { GiftTier } from './giftTier';

interface GiftFeedProps {
  settings: DanmakuSettings;
  roomId: string;
  platform: string;
  clearToken: number;
}

interface GiftToast {
  event: DanmakuEvent;
  tier: GiftTier;
  expiresAt: number;
}

export interface GiftFeedHandle {
  push: (event: DanmakuEvent) => void;
  clear: () => void;
}

const MAX_GIFTS = 4;
const SMALL_TTL_MS = 4_600;
const LARGE_TTL_MS = 7_200;

export const GiftFeed = forwardRef<GiftFeedHandle, GiftFeedProps>(function GiftFeed(
  { settings, roomId, platform, clearToken },
  ref,
): React.JSX.Element | null {
  const [items, setItems] = useState<GiftToast[]>([]);

  const push = useCallback(
    (event: DanmakuEvent) => {
      if (event.kind !== 'gift' || event.roomId !== roomId || event.platform !== platform) return;

      const tier = giftTier(event);
      if (!giftVisible(tier, settings)) return;

      const ttl = tier === 'large' ? LARGE_TTL_MS : SMALL_TTL_MS;
      setItems((current) =>
        [...current, { event, tier, expiresAt: Date.now() + ttl }].slice(-MAX_GIFTS),
      );
    },
    [platform, roomId, settings],
  );

  useImperativeHandle(ref, () => ({ push, clear: () => setItems([]) }), [push]);

  useEffect(() => {
    setItems((current) => {
      const next = current.filter((item) => giftVisible(item.tier, settings));
      return next.length === current.length ? current : next;
    });
  }, [settings]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      setItems((current) => {
        const next = current.filter((item) => item.expiresAt > now);
        return next.length === current.length ? current : next;
      });
    }, 500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (clearToken > 0) setItems([]);
  }, [clearToken]);

  if (items.length === 0) return null;

  return (
    <div
      className={`gift-feed${settings.paused ? ' is-paused' : ''}`}
      role="log"
      aria-live="polite"
      aria-label="礼物动态"
    >
      {items.map((item) => (
        <div key={item.event.id} className={`gift-toast is-${item.tier}`}>
          <span className="gift-toast-icon" aria-hidden="true">
            <Icon name="gift" size={item.tier === 'large' ? 20 : 15} />
          </span>
          <span className="gift-toast-copy">
            <span className="gift-toast-head">
              <strong>{item.event.nickname || '观众'}</strong>
              {item.tier === 'large' ? <small className="gift-toast-tier">大礼物</small> : null}
            </span>
            <span className="gift-toast-text">
              送出 {item.event.giftName ?? '礼物'}
              <em> × {item.event.giftCount ?? 1}</em>
            </span>
          </span>
        </div>
      ))}
    </div>
  );
});
