import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import { MAX_SPECIAL_FOLLOWS } from '@shared/contracts/specialFollow';
import type { SpecialFollowEntry, SpecialFollowTarget } from '@shared/contracts/specialFollow';

const targetSchema = z.object({
  platform: z.enum(['douyu', 'bilibili', 'huya']),
  roomId: z.string().trim().min(1).max(32),
  name: z.string().trim().max(80).optional(),
  title: z.string().trim().max(200).optional(),
  cover: z.string().trim().max(500).optional(),
});

const entrySchema = z.object({
  platform: z.enum(['douyu', 'bilibili', 'huya']),
  roomId: z.string().trim().min(1).max(32),
  name: z.string().trim().max(80),
  title: z.string().trim().max(200),
  cover: z.string().trim().max(500).optional(),
  addedAt: z.number().finite().positive().max(8_640_000_000_000_000),
});

const entriesSchema = z.array(entrySchema).max(MAX_SPECIAL_FOLLOWS);
const fileSchema = z.object({ version: z.literal(1), entries: entriesSchema });

function keyOf(entry: Pick<SpecialFollowEntry, 'platform' | 'roomId'>): string {
  return `${entry.platform}:${entry.roomId}`;
}

function normalize(entries: readonly SpecialFollowEntry[]): SpecialFollowEntry[] {
  const seen = new Set<string>();
  return [...entries]
    .sort((left, right) => right.addedAt - left.addedAt)
    .filter((entry) => {
      const key = keyOf(entry);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_SPECIAL_FOLLOWS);
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
 * Pins rooms across app windows in a global file, like room history. The
 * renderer never writes the file directly; every mutation is validated here.
 */
export class JsonSpecialFollowStore {
  private writeQueue: Promise<void> = Promise.resolve();
  private mutationQueue: Promise<unknown> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation, operation);
    this.mutationQueue = result.catch(() => undefined);
    return result;
  }

  async load(): Promise<SpecialFollowEntry[]> {
    await this.writeQueue;
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      return normalize(fileSchema.parse(parsed).entries);
    } catch (error) {
      if (isMissingFile(error)) return [];
      throw error;
    }
  }

  async save(rawEntries: unknown): Promise<SpecialFollowEntry[]> {
    const entries = normalize(entriesSchema.parse(rawEntries));
    const snapshot = JSON.stringify({ version: 1, entries }, null, 2);
    const write = this.writeQueue.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const tempPath = `${this.filePath}.tmp`;
      await writeFile(tempPath, snapshot, 'utf8');
      await rename(tempPath, this.filePath);
    });
    this.writeQueue = write.catch(() => undefined);
    await write;
    return entries;
  }

  async toggle(rawTarget: SpecialFollowTarget): Promise<SpecialFollowEntry[]> {
    const target = targetSchema.parse(rawTarget);
    const name = target.name?.trim() || `房间 ${target.roomId}`;
    const cover = target.cover?.trim();
    const entry: SpecialFollowEntry = {
      platform: target.platform,
      roomId: target.roomId,
      name,
      title: target.title?.trim() || name,
      ...(cover ? { cover } : {}),
      addedAt: Date.now(),
    };

    return this.enqueueMutation(async () => {
      const existing = await this.load();
      const key = keyOf(entry);
      const isPinned = existing.some((item) => keyOf(item) === key);
      return this.save(isPinned ? existing.filter((item) => keyOf(item) !== key) : [entry, ...existing]);
    });
  }
}
