/** 自动领取（抢礼物红包）相关契约，主进程定时轮询、渲染进程只负责开关与展示。 */
export interface AutoClaimSettings {
  /** 是否自动抢直播间礼物红包。 */
  redPacket: boolean;
  /** 轮询间隔（秒）。斗鱼红包列表变化不快，30 秒足够。 */
  intervalSec: number;
}

export const AUTO_CLAIM_INTERVALS = [30, 60, 120, 300] as const;

export const DEFAULT_AUTO_CLAIM_SETTINGS: AutoClaimSettings = {
  redPacket: false,
  intervalSec: 60,
};

/** 同时监听的直播间数量上限，避免一次轮询打太多接口。 */
export const MAX_AUTO_CLAIM_ROOMS = 12;

/** 最近事件保留条数，用于面板上的流水。 */
export const AUTO_CLAIM_EVENT_LIMIT = 12;

export type AutoClaimEventKind = 'claimed' | 'empty' | 'error' | 'info';

export interface AutoClaimEvent {
  at: number;
  roomId: string;
  kind: AutoClaimEventKind;
  message: string;
}

export interface AutoClaimState {
  settings: AutoClaimSettings;
  /** 正在监听的斗鱼直播间。 */
  rooms: string[];
  polling: boolean;
  lastPollAt: number | null;
  events: AutoClaimEvent[];
}

export function autoClaimEventLabel(kind: AutoClaimEventKind): string {
  if (kind === 'claimed') return '已抢到';
  if (kind === 'empty') return '已抢完';
  if (kind === 'error') return '出错';
  return '提示';
}
