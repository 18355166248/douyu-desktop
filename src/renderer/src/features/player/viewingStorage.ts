import { z } from 'zod';
import type { StreamPlatform } from '@shared/contracts/stream';
import { qualityOptionsFor } from './streamQuality';

const roomSchema = z
  .object({
    platform: z.enum(['douyu', 'bilibili', 'huya']),
    roomId: z.string().trim().min(1).max(32),
    quality: z.enum(['0', '3', '4', '8', '80', '150', '250', '400', '10000', '2000']),
    preferHls: z.boolean(),
    volume: z.number().min(0).max(1),
    muted: z.boolean(),
  })
  .refine((room) =>
    qualityOptionsFor(room.platform).some((option) => option.value === room.quality),
  );
export type SavedRoom = z.infer<typeof roomSchema>;
const sceneSchema = z
  .object({
    id: z.string().min(1).max(80),
    name: z.string().trim().min(1).max(30),
    rooms: z.array(roomSchema).min(1).max(6),
    layout: z.enum(['even', 'focus']),
    mainKey: z.string().nullable(),
  })
  .refine(
    (scene) =>
      new Set(scene.rooms.map((room) => `${room.platform}:${room.roomId}`)).size ===
      scene.rooms.length,
  );
export type ViewingScene = z.infer<typeof sceneSchema>;
const SCENES_KEY = 'douyu-desktop.viewing-scenes.v1';
function lastKey(): string {
  const params = new URLSearchParams(window.location?.search ?? '');
  const workspace = params.get('workspace');
  const slot =
    workspace && /^secondary-[1-3]$/.test(workspace)
      ? workspace
      : params.get('role') === 'secondary'
        ? 'secondary-1'
        : 'main';
  return `douyu-desktop.last-viewing.${slot}.v1`;
}
const PREFERENCES_KEY = 'douyu-desktop.room-preferences.v1';
const ALIASES_KEY = 'douyu-desktop.room-aliases.v1';

export function readStored(key: string): unknown {
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}
export function writeStored(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export function getRoomPreference(platform: StreamPlatform, roomId: string): SavedRoom | undefined {
  const data = readStored(PREFERENCES_KEY);
  if (!data || typeof data !== 'object') return undefined;
  const aliases = readStored(ALIASES_KEY);
  const alias =
    aliases && typeof aliases === 'object'
      ? (aliases as Record<string, unknown>)[`${platform}:${roomId}`]
      : null;
  const canonicalId =
    typeof alias === 'string' && /^[a-zA-Z0-9_]{1,32}$/.test(alias) ? alias : roomId;
  const parsed = roomSchema.safeParse(
    (data as Record<string, unknown>)[`${platform}:${canonicalId}`],
  );
  return parsed.success ? parsed.data : undefined;
}
export function saveRoomAlias(
  platform: StreamPlatform,
  requested: string,
  canonical: string,
): void {
  if (requested === canonical) return;
  const data = readStored(ALIASES_KEY);
  const key = `${platform}:${requested}`;
  const entries =
    data && typeof data === 'object' && !Array.isArray(data)
      ? Object.entries(data).filter(([entry]) => entry !== key)
      : [];
  writeStored(ALIASES_KEY, Object.fromEntries([...entries.slice(-199), [key, canonical]]));
}
export function saveRoomPreference(room: SavedRoom): void {
  if (!roomSchema.safeParse(room).success) return;
  const data = readStored(PREFERENCES_KEY);
  const current = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  // Bound storage growth; the most recently touched rooms are kept last.
  const key = `${room.platform}:${room.roomId}`;
  const entries = Object.entries(current).filter(([entryKey]) => entryKey !== key);
  writeStored(PREFERENCES_KEY, Object.fromEntries([...entries.slice(-199), [key, room]]));
}
export function loadScenes(): ViewingScene[] {
  const data = readStored(SCENES_KEY);
  if (!Array.isArray(data)) return [];
  return data.slice(0, 20).flatMap((item) => {
    const parsed = sceneSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}
export function saveScenes(scenes: ViewingScene[]): boolean {
  return writeStored(SCENES_KEY, scenes.slice(0, 20));
}
export function loadLastViewing(): ViewingScene | null {
  const parsed = sceneSchema.safeParse(readStored(lastKey()));
  return parsed.success ? parsed.data : null;
}
export function saveLastViewing(scene: ViewingScene): void {
  writeStored(lastKey(), scene);
}
export function clearLastViewing(): void {
  writeStored(lastKey(), null);
}
