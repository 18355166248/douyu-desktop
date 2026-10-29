export type DanmakuArea = 'full' | 'quarter' | 'top' | 'bottom';

export interface DanmakuSettings {
  visible: boolean;
  paused: boolean;
  /** 50-200, where 100 is the default speed. */
  speed: number;
  /** 0-100, applied to the whole flying layer. */
  opacity: number;
  /** 80-180, a percentage of the engine's 20px base font size. */
  fontScale: number;
  area: DanmakuArea;
  /** 1-10; higher values pack tracks closer together. */
  density: number;
  blockedKeywords: string[];
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
  showSmallGift: boolean;
  showLargeGift: boolean;
}

export const DEFAULT_DANMAKU_SETTINGS: DanmakuSettings = {
  visible: true,
  paused: false,
  speed: 100,
  opacity: 100,
  fontScale: 100,
  area: 'full',
  density: 6,
  blockedKeywords: [],
  blockLarge: false,
  blockTop: false,
  blockBottom: false,
  blockRole: false,
  blockSuper: false,
  simplified: false,
  showBadges: false,
  showNickname: false,
  showEnter: false,
  showGift: true,
  showSmallGift: true,
  showLargeGift: true,
};

const STORAGE_KEY = 'douyu-desktop.danmaku.settings.v2';
const LEGACY_STORAGE_KEY = 'douyu-desktop.danmaku.settings.v1';
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
    fontScale: numberOr(value.fontScale, DEFAULT_DANMAKU_SETTINGS.fontScale, 80, 180),
    area: areaOr(value.area),
    density: numberOr(value.density, DEFAULT_DANMAKU_SETTINGS.density, 1, 10),
    blockedKeywords: normalizeKeywords(value.blockedKeywords),
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
    showSmallGift: boolOr(value.showSmallGift, DEFAULT_DANMAKU_SETTINGS.showSmallGift),
    showLargeGift: boolOr(value.showLargeGift, DEFAULT_DANMAKU_SETTINGS.showLargeGift),
  };
}

export function migrateDanmakuSettings(raw: unknown): DanmakuSettings {
  const parsed = parseDanmakuSettings(raw);
  return {
    ...parsed,
    speed: parsed.speed === 140 ? 100 : parsed.speed,
    fontScale: parsed.fontScale === 140 ? 100 : parsed.fontScale,
    showBadges: false,
    showNickname: false,
  };
}

export function loadDanmakuSettings(): DanmakuSettings {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...parseDanmakuSettings(JSON.parse(stored)), paused: false };

    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const migrated = migrateDanmakuSettings(JSON.parse(legacy));
      saveDanmakuSettings(migrated);
      return migrated;
    }

    return { ...DEFAULT_DANMAKU_SETTINGS };
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

// 限制词数和长度，避免异常存储内容拖慢每条实时弹幕的过滤。
export function normalizeKeywords(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw
        .filter((word): word is string => typeof word === 'string')
        .map((word) => word.trim().slice(0, 50).toLowerCase())
        .filter(Boolean),
    ),
  ].slice(0, 100);
}
