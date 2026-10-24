export type DanmakuPlatform = 'douyu' | 'huya' | 'bilibili';

export type DanmakuKind = 'chat' | 'enter' | 'gift';

export type DanmakuPosition = 'scroll' | 'top' | 'bottom';

export interface DanmakuMessage {
  platform: DanmakuPlatform;
  roomId: string;
  kind: DanmakuKind;
  userId: string;
  nickname: string;
  text: string;
  color: string;
  level: number;
  badgeName?: string | undefined;
  badgeLevel?: number | undefined;
  isNoble?: boolean | undefined;
  isRoomAdmin?: boolean | undefined;
  isSuper?: boolean | undefined;
  giftName?: string | undefined;
  giftCount?: number | undefined;
  /** Douyu `dms` marker. Missing values are usually robot/low-quality messages. */
  hasDms?: boolean | undefined;
  position?: DanmakuPosition | undefined;
}

export interface DanmakuEvent extends DanmakuMessage {
  id: string;
  timestamp: number;
}

export type DanmakuConnectionStatus =
  'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

export interface DanmakuStatusEvent {
  roomId: string;
  platform: DanmakuPlatform;
  status: DanmakuConnectionStatus;
  message?: string | undefined;
}
