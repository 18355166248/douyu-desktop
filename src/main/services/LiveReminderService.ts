import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Notification } from 'electron';
import { z } from 'zod';
import type { LiveReminderSettings } from '@shared/contracts/viewing';
import type { Logger } from '@core/ports/Logger';
import type { AccountSessionManager } from './AccountSessionManager';
import type { HomeService } from './HomeService';
import type { JsonSpecialFollowStore } from '../adapters/storage/JsonSpecialFollowStore';
import { LiveReminderTracker } from './LiveReminderTracker';

export const liveReminderSchema = z.object({
  enabled: z.boolean(),
  quietEnabled: z.boolean(),
  quietStart: z.number().int().min(0).max(23),
  quietEnd: z.number().int().min(0).max(23),
});
export class LiveReminderService {
  private settings: LiveReminderSettings = {
    enabled: false,
    quietEnabled: true,
    quietStart: 23,
    quietEnd: 8,
  };
  private tracker = new LiveReminderTracker();
  private revision = 0;
  private busy = false;
  private stopped = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private notifications = new Set<Notification>();
  private writes: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly file: string,
    private readonly accounts: AccountSessionManager,
    private readonly home: HomeService,
    private readonly special: JsonSpecialFollowStore,
    private readonly logger: Logger,
    private readonly onOpen: (roomId: string) => void,
  ) {}
  async start(): Promise<void> {
    try {
      this.settings = liveReminderSchema.parse(JSON.parse(await readFile(this.file, 'utf8')));
    } catch {
      /* First use or invalid settings: reminders remain opt-in. */
    }
    this.restart();
  }
  getSettings(): LiveReminderSettings & { supported: boolean } {
    return { ...this.settings, supported: Notification.isSupported() };
  }
  configure(raw: unknown): Promise<LiveReminderSettings & { supported: boolean }> {
    const next = liveReminderSchema.parse(raw);
    const write = this.writes.then(async () => {
      await mkdir(dirname(this.file), { recursive: true });
      await writeFile(`${this.file}.tmp`, JSON.stringify(next), 'utf8');
      await rename(`${this.file}.tmp`, this.file);
      this.settings = next;
      this.restart();
      return this.getSettings();
    });
    this.writes = write.catch(() => undefined);
    return write;
  }
  private restart(): void {
    this.revision += 1;
    this.tracker.reset();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.stopped || !this.settings.enabled || !Notification.isSupported()) return;
    this.timer = setInterval(() => void this.poll(), 60_000);
    void this.poll();
  }
  async poll(): Promise<void> {
    if (this.busy || this.stopped || !this.settings.enabled) return;
    this.busy = true;
    const revision = this.revision;
    try {
      const account = await this.accounts.getActiveId();
      if (!account) {
        this.tracker.reset();
        return;
      }
      const [rooms, special] = await Promise.all([
        this.home.followed(account),
        this.special.load(),
      ]);
      if (
        this.stopped ||
        revision !== this.revision ||
        account !== (await this.accounts.getActiveId())
      )
        return;
      const watched = new Set(special.map((room) => `${room.platform}:${room.roomId}`));
      for (const room of this.tracker.observe(account, rooms, watched, this.settings)) {
        const notification = new Notification({
          title: `${room.name} 开播了`,
          body: room.title || `斗鱼房间 ${room.roomId}`,
          silent: true,
        });
        this.notifications.add(notification);
        notification.once('click', () => {
          if (!this.stopped) this.onOpen(room.roomId);
        });
        notification.once('close', () => this.notifications.delete(notification));
        notification.once('failed', (_event, error) => {
          this.notifications.delete(notification);
          this.logger.warn('reminder.notification.failed', { message: error });
        });
        notification.show();
      }
    } catch (error) {
      this.logger.warn('reminder.poll.failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.busy = false;
    }
  }
  stop(): void {
    this.stopped = true;
    this.revision += 1;
    if (this.timer) clearInterval(this.timer);
    for (const notification of this.notifications) notification.close();
    this.notifications.clear();
  }
}
