import type { FollowedRoom } from '@shared/contracts/follow';
import type { LiveReminderSettings } from '@shared/contracts/viewing';

export function isQuietHour(hour: number, settings: LiveReminderSettings): boolean {
  if (!settings.quietEnabled || settings.quietStart === settings.quietEnd) return false;
  return settings.quietStart < settings.quietEnd
    ? hour >= settings.quietStart && hour < settings.quietEnd
    : hour >= settings.quietStart || hour < settings.quietEnd;
}

/** Only an observed offline -> live transition produces a notification. */
export class LiveReminderTracker {
  private account: string | null = null;
  private previous = new Map<string, boolean>();
  private notified = new Map<string, number>();
  reset(): void {
    this.account = null;
    this.previous.clear();
    this.notified.clear();
  }
  observe(
    account: string,
    rooms: FollowedRoom[],
    watched: Set<string>,
    settings: LiveReminderSettings,
    now = new Date(),
  ): FollowedRoom[] {
    if (this.account !== account) {
      this.reset();
      this.account = account;
    }
    const next = new Map<string, boolean>();
    const notifications: FollowedRoom[] = [];
    for (const room of rooms) {
      const key = `${room.platform}:${room.roomId}`;
      if (!watched.has(key) && !room.isSpecial) continue;
      const live = room.isLive && !room.hasVideo;
      if (
        settings.enabled &&
        live &&
        this.previous.get(key) === false &&
        !isQuietHour(now.getHours(), settings) &&
        now.getTime() - (this.notified.get(key) ?? Number.NEGATIVE_INFINITY) >= 30 * 60_000
      ) {
        notifications.push(room);
        this.notified.set(key, now.getTime());
      }
      next.set(key, live);
    }
    this.previous = next;
    return notifications;
  }
}
