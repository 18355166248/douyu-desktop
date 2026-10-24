export type DanmakuArea = 'full' | 'quarter' | 'top' | 'bottom';

export interface DanmakuSettings {
  visible: boolean;
  paused: boolean;
  /** 50-200, where 100 is the default speed. */
  speed: number;
  /** 0-100, applied to the whole flying layer. */
  opacity: number;
  /** 60-180, a percentage of the engine's base font size. */
  fontScale: number;
  area: DanmakuArea;
  /** 1-10; higher values pack tracks closer together. */
  density: number;
  blockLarge: boolean;
  blockTop: boolean;
  blockBottom: boolean;
  blockRole: boolean;
  blockSuper: boolean;
  simplified: boolean;
  showBadges: boolean;
  showNickname: boolean;
  showEnter: boolean;
  showGift: boolean;
}

export const DEFAULT_DANMAKU_SETTINGS: DanmakuSettings = {
  visible: true,
  paused: false,
  speed: 100,
  opacity: 100,
  fontScale: 100,
  area: 'full',
  density: 6,
  blockLarge: false,
  blockTop: false,
  blockBottom: false,
  blockRole: false,
  blockSuper: false,
  simplified: false,
  showBadges: true,
  showNickname: true,
  showEnter: false,
  showGift: true,
};

const STORAGE_KEY = 'douyu-desktop.danmaku.settings.v1';
const AREAS: readonly DanmakuArea[] = ['full', 'quarter', 'top', 'bottom'];

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function numberOr(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' && (typeof value !== 'string' || value.trim() === '')) {
    return fallback;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function areaOr(value: unknown): DanmakuArea {
  return AREAS.includes(value as DanmakuArea) ? (value as DanmakuArea) : 'full';
}

export function parseDanmakuSettings(raw: unknown): DanmakuSettings {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_DANMAKU_SETTINGS };
  const value = raw as Record<string, unknown>;

  return {
    visible: boolOr(value.visible, DEFAULT_DANMAKU_SETTINGS.visible),
    paused: boolOr(value.paused, DEFAULT_DANMAKU_SETTINGS.paused),
    speed: numberOr(value.speed, DEFAULT_DANMAKU_SETTINGS.speed, 50, 200),
    opacity: numberOr(value.opacity, DEFAULT_DANMAKU_SETTINGS.opacity, 0, 100),
    fontScale: numberOr(value.fontScale, DEFAULT_DANMAKU_SETTINGS.fontScale, 60, 180),
    area: areaOr(value.area),
    density: numberOr(value.density, DEFAULT_DANMAKU_SETTINGS.density, 1, 10),
    blockLarge: boolOr(value.blockLarge, DEFAULT_DANMAKU_SETTINGS.blockLarge),
    blockTop: boolOr(value.blockTop, DEFAULT_DANMAKU_SETTINGS.blockTop),
    blockBottom: boolOr(value.blockBottom, DEFAULT_DANMAKU_SETTINGS.blockBottom),
    blockRole: boolOr(value.blockRole, DEFAULT_DANMAKU_SETTINGS.blockRole),
    blockSuper: boolOr(value.blockSuper, DEFAULT_DANMAKU_SETTINGS.blockSuper),
    simplified: boolOr(value.simplified, DEFAULT_DANMAKU_SETTINGS.simplified),
    showBadges: boolOr(value.showBadges, DEFAULT_DANMAKU_SETTINGS.showBadges),
    showNickname: boolOr(value.showNickname, DEFAULT_DANMAKU_SETTINGS.showNickname),
    showEnter: boolOr(value.showEnter, DEFAULT_DANMAKU_SETTINGS.showEnter),
    showGift: boolOr(value.showGift, DEFAULT_DANMAKU_SETTINGS.showGift),
  };
}

export function loadDanmakuSettings(): DanmakuSettings {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return { ...DEFAULT_DANMAKU_SETTINGS };
    return { ...parseDanmakuSettings(JSON.parse(stored)), paused: false };
  } catch {
    return { ...DEFAULT_DANMAKU_SETTINGS };
  }
}

export function saveDanmakuSettings(settings: DanmakuSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...settings, paused: false }));
  } catch {
    // Storage can be unavailable in a privacy-restricted renderer; settings still apply.
  }
}
