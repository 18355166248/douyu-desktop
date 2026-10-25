import { MAX_ROOM_HISTORY } from '@shared/contracts/history';
import type { RoomHistoryEntry } from '@shared/contracts/history';
import type { StreamPlatform } from '@shared/contracts/stream';
import { roomKey } from '../../lib/streamIdentity';

export { MAX_ROOM_HISTORY };
export type { RoomHistoryEntry };

export const ROOM_HISTORY_STORAGE_KEY = 'douyu-desktop.room-history.v2';
export const LEGACY_ROOM_HISTORY_STORAGE_KEY = 'douyu-desktop.room-history.v1';

export interface RoomVisit {
  platform?: StreamPlatform | undefined;
  roomId: string;
  title: string;
  anchorName: string;
  cover?: string | undefined;
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function cleanCover(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cover = value.trim();
  if (!cover || cover.length > 500) return undefined;
  return /^https?:\/\//i.test(cover) ? cover : undefined;
}

function parsePlatform(value: unknown): StreamPlatform {
  return value === 'bilibili' || value === 'huya' ? value : 'douyu';
}

function parseEntry(raw: unknown): RoomHistoryEntry | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as Record<string, unknown>;
  const roomId = cleanText(value.roomId, 32);
  const visitedAt = typeof value.visitedAt === 'number' ? value.visitedAt : Number.NaN;
  if (
    !roomId ||
    !Number.isFinite(visitedAt) ||
    visitedAt <= 0 ||
    visitedAt > 8_640_000_000_000_000
  ) {
    return null;
  }

  const cover = cleanCover(value.cover);
  return {
    platform: parsePlatform(value.platform),
    roomId,
    title: cleanText(value.title, 200),
    anchorName: cleanText(value.anchorName, 80),
    visitedAt,
    ...(cover ? { cover } : {}),
  };
}

/**
 * Keeps the most recent entry per platform/room and sorts newest visits first.
 */
export function parseRoomHistory(raw: unknown): RoomHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw
    .map((entry) => parseEntry(entry))
    .filter((entry): entry is RoomHistoryEntry => entry !== null)
    .sort((left, right) => right.visitedAt - left.visitedAt)
    .filter((entry) => {
      const key = roomKey(entry.platform, entry.roomId);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_ROOM_HISTORY);
}

export function upsertRoomHistory(
  entries: readonly RoomHistoryEntry[],
  visit: RoomVisit,
  visitedAt = Date.now(),
): RoomHistoryEntry[] {
  const roomId = visit.roomId.trim();
  if (!roomId) return parseRoomHistory(entries);

  const platform = visit.platform ?? 'douyu';
  const key = roomKey(platform, roomId);
  const previousCover = entries.find(
    (entry) => roomKey(entry.platform, entry.roomId) === key,
  )?.cover;
  const cover = visit.cover ?? previousCover;

  return parseRoomHistory([
    {
      platform,
      roomId,
      title: visit.title,
      anchorName: visit.anchorName,
      visitedAt,
      ...(cover ? { cover } : {}),
    },
    ...entries,
  ]);
}

export function removeRoomHistory(
  entries: readonly RoomHistoryEntry[],
  keys: readonly string[],
): RoomHistoryEntry[] {
  const remove = new Set(keys);
  if (remove.size === 0) return [...entries];
  return entries.filter((entry) => !remove.has(roomKey(entry.platform, entry.roomId)));
}

/**
 * Merges legacy/global history groups by platform-scoped room key. The newest
 * visit for a room wins; this is used during one-time localStorage migration.
 */
export function mergeRoomHistory(
  ...groups: readonly (readonly RoomHistoryEntry[])[]
): RoomHistoryEntry[] {
  return parseRoomHistory(groups.flat());
}

export function historyLabel(entry: RoomHistoryEntry): string {
  return `房间 ${entry.roomId}`;
}

export function formatHistoryTime(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';

  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function getStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadLegacyRoomHistory(): RoomHistoryEntry[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw =
      storage.getItem(ROOM_HISTORY_STORAGE_KEY) ?? storage.getItem(LEGACY_ROOM_HISTORY_STORAGE_KEY);
    return raw ? parseRoomHistory(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function clearLegacyRoomHistory(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(ROOM_HISTORY_STORAGE_KEY);
    storage.removeItem(LEGACY_ROOM_HISTORY_STORAGE_KEY);
  } catch {
    // Storage can be unavailable; the global file is already the source of truth.
  }
}
