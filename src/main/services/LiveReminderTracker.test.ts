import { describe, expect, it } from 'vitest';
import type { FollowedRoom } from '@shared/contracts/follow';
import { isQuietHour, LiveReminderTracker } from './LiveReminderTracker';
const settings = { enabled: true, quietEnabled: true, quietStart: 23, quietEnd: 8 };
const room: FollowedRoom = {
  platform: 'douyu',
  roomId: '1',
  name: '主播',
  title: '直播',
  isLive: false,
  isSpecial: true,
  hasVideo: false,
  heat: 1,
};
const noon = new Date(2026, 9, 28, 12);
describe('live reminders', () => {
  it('handles overnight, same-day and disabled quiet periods', () => {
    expect(isQuietHour(23, settings)).toBe(true);
    expect(isQuietHour(7, settings)).toBe(true);
    expect(isQuietHour(8, settings)).toBe(false);
    expect(isQuietHour(12, { ...settings, quietStart: 9, quietEnd: 17 })).toBe(true);
    expect(isQuietHour(12, { ...settings, quietStart: 9, quietEnd: 9 })).toBe(false);
    expect(isQuietHour(23, { ...settings, quietEnabled: false })).toBe(false);
  });
  it('does not notify on startup or repeated live snapshots', () => {
    const tracker = new LiveReminderTracker();
    const live = { ...room, isLive: true };
    expect(tracker.observe('a', [live], new Set(), settings, noon)).toEqual([]);
    expect(tracker.observe('a', [live], new Set(), settings, noon)).toEqual([]);
    tracker.observe('a', [room], new Set(), settings, noon);
    expect(tracker.observe('a', [live], new Set(), settings, noon)).toEqual([live]);
    tracker.observe('a', [room], new Set(), settings, noon);
    expect(tracker.observe('a', [live], new Set(), settings, noon)).toEqual([]);
  });
  it('requires known state for each account and watched room', () => {
    const tracker = new LiveReminderTracker();
    tracker.observe('a', [room], new Set(), settings, noon);
    expect(tracker.observe('b', [{ ...room, isLive: true }], new Set(), settings, noon)).toEqual(
      [],
    );
    const manual = { ...room, isSpecial: false };
    tracker.observe('b', [manual], new Set(), settings, noon);
    expect(
      tracker.observe('b', [{ ...manual, isLive: true }], new Set(['douyu:1']), settings, noon),
    ).toEqual([]);
    tracker.observe('b', [manual], new Set(['douyu:1']), settings, noon);
    expect(
      tracker.observe('b', [{ ...manual, isLive: true }], new Set(['douyu:1']), settings, noon),
    ).toHaveLength(1);
  });
  it('does not replay transitions suppressed by quiet hours or video loops', () => {
    const tracker = new LiveReminderTracker();
    tracker.observe('a', [room], new Set(), settings, noon);
    expect(
      tracker.observe('a', [{ ...room, isLive: true, hasVideo: true }], new Set(), settings, noon),
    ).toEqual([]);
    const live = { ...room, isLive: true };
    expect(tracker.observe('a', [live], new Set(), settings, new Date(2026, 9, 28, 23))).toEqual(
      [],
    );
    expect(tracker.observe('a', [live], new Set(), settings, noon)).toEqual([]);
  });
});
