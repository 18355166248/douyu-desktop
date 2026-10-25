import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import { MAX_ROOM_HISTORY } from '@shared/contracts/history';
import type { RoomHistoryEntry } from '@shared/contracts/history';

const roomHistoryEntrySchema = z.object({
  platform: z.enum(['douyu', 'bilibili', 'huya']),
  roomId: z.string().trim().min(1).max(32),
  title: z.string().trim().max(200),
  anchorName: z.string().trim().max(80),
  visitedAt: z.number().finite().positive().max(8_640_000_000_000_000),
});

const roomHistoryEntriesSchema = z.array(roomHistoryEntrySchema).max(MAX_ROOM_HISTORY);

const roomHistoryFileSchema = z.object({
  version: z.literal(1),
  entries: roomHistoryEntriesSchema,
});

function normalize(entries: readonly RoomHistoryEntry[]): RoomHistoryEntry[] {
  const seen = new Set<string>();
  return [...entries]
    .sort((left, right) => right.visitedAt - left.visitedAt)
    .filter((entry) => {
      const key = `${entry.platform}:${entry.roomId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_ROOM_HISTORY);
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}

/**
 * Persists room history outside the installed app and Electron userData so it
 * survives uninstall/reinstall. Renderer input is validated here, not trusted.
 */
export class JsonRoomHistoryStore {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async load(): Promise<RoomHistoryEntry[]> {
    await this.writeQueue;
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      return normalize(roomHistoryFileSchema.parse(parsed).entries);
    } catch (error) {
      if (isMissingFile(error)) return [];
      throw error;
    }
  }

  async save(rawEntries: unknown): Promise<RoomHistoryEntry[]> {
    const entries = normalize(roomHistoryEntriesSchema.parse(rawEntries));
    const snapshot = JSON.stringify({ version: 1, entries }, null, 2);
    const write = this.writeQueue.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const tempPath = `${this.filePath}.tmp`;
      await writeFile(tempPath, snapshot, 'utf8');
      await rename(tempPath, this.filePath);
    });
    // Report this write's failure to its caller without blocking later saves.
    this.writeQueue = write.catch(() => undefined);
    await write;
    return entries;
  }

  /**
   * Adds entries to the existing global history. Used once to bring over
   * history written by the Vite dev origin (`http://localhost:5173`), which
   * packaged builds cannot read through localStorage.
   */
  async merge(rawEntries: unknown): Promise<RoomHistoryEntry[]> {
    const existing = await this.load();
    const incoming = normalize(roomHistoryEntriesSchema.parse(rawEntries));
    return this.save(normalize([...existing, ...incoming]));
  }
}
