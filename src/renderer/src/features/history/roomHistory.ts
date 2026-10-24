export const ROOM_HISTORY_STORAGE_KEY = 'douyu-desktop.room-history.v1';
export const MAX_ROOM_HISTORY = 30;

export interface RoomHistoryEntry {
  roomId: string;
  title: string;
  anchorName: string;
  /** Epoch milliseconds of the most recent visit. */
  visitedAt: number;
}

export interface RoomVisit {
  roomId: string;
  title: string;
  anchorName: string;
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
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

  return {
    roomId,
    title: cleanText(value.title, 200),
    anchorName: cleanText(value.anchorName, 80),
    visitedAt,
  };
}

/**
 * Keeps the most recent entry per room and sorts newest visits first.
 */
export function parseRoomHistory(raw: unknown): RoomHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw
    .map((entry) => parseEntry(entry))
    .filter((entry): entry is RoomHistoryEntry => entry !== null)
    .sort((left, right) => right.visitedAt - left.visitedAt)
    .filter((entry) => {
      if (seen.has(entry.roomId)) return false;
      seen.add(entry.roomId);
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

  return parseRoomHistory([
    {
      roomId,
      title: visit.title,
      anchorName: visit.anchorName,
      visitedAt,
    },
    ...entries,
  ]);
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

export function loadRoomHistory(): RoomHistoryEntry[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(ROOM_HISTORY_STORAGE_KEY);
    return raw ? parseRoomHistory(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function saveRoomHistory(entries: readonly RoomHistoryEntry[]): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(ROOM_HISTORY_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage can be unavailable or full; history remains session-local.
  }
}
