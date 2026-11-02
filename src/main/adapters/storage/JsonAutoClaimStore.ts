import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import { AUTO_CLAIM_INTERVALS, DEFAULT_AUTO_CLAIM_SETTINGS } from '@shared/contracts/autoClaim';
import type { AutoClaimSettings } from '@shared/contracts/autoClaim';

const MIN_INTERVAL = AUTO_CLAIM_INTERVALS[0];
const MAX_INTERVAL = AUTO_CLAIM_INTERVALS[AUTO_CLAIM_INTERVALS.length - 1] ?? 300;

const settingsSchema = z.object({
  redPacket: z.boolean(),
  intervalSec: z.number().int().min(MIN_INTERVAL).max(MAX_INTERVAL),
});

const fileSchema = z.object({ version: z.literal(1), settings: settingsSchema });

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}

/**
 * Persists the auto-claim switches next to the other per-user JSON files. The
 * renderer never writes it: every save is validated here.
 */
export class JsonAutoClaimStore {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async load(): Promise<AutoClaimSettings> {
    await this.writeQueue;
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      return fileSchema.parse(parsed).settings;
    } catch (error) {
      if (isMissingFile(error)) return DEFAULT_AUTO_CLAIM_SETTINGS;
      // A corrupted settings file must not break startup.
      return DEFAULT_AUTO_CLAIM_SETTINGS;
    }
  }

  async save(rawSettings: unknown): Promise<AutoClaimSettings> {
    const settings = settingsSchema.parse(rawSettings);
    const snapshot = JSON.stringify({ version: 1, settings }, null, 2);
    const write = this.writeQueue.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const tempPath = `${this.filePath}.tmp`;
      await writeFile(tempPath, snapshot, 'utf8');
      await rename(tempPath, this.filePath);
    });
    this.writeQueue = write.catch(() => undefined);
    await write;
    return settings;
  }
}
