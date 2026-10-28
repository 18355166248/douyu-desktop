import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FollowedRoom } from '@shared/contracts/follow';
import type { AccountSessionManager } from './AccountSessionManager';
import type { HomeService } from './HomeService';
import type { JsonSpecialFollowStore } from '../adapters/storage/JsonSpecialFollowStore';
import { LiveReminderService } from './LiveReminderService';

const state = vi.hoisted(() => ({
  notifications: [] as Array<{
    show: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    emit: (event: string) => boolean;
  }>,
  write: vi.fn(async () => undefined),
}));
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
  readFile: vi.fn(async () => {
    throw new Error('missing');
  }),
  rename: vi.fn(),
  writeFile: state.write,
}));
vi.mock('electron', () => ({
  Notification: class extends EventEmitter {
    static isSupported() {
      return true;
    }
    show = vi.fn();
    close = vi.fn();
    constructor() {
      super();
      state.notifications.push(this);
    }
  },
}));
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
const getActiveId = vi.fn(async () => 'a');
const followed = vi.fn(async () => [room]);
const open = vi.fn();
const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
let service: LiveReminderService;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 28, 12));
  vi.clearAllMocks();
  state.notifications = [];
  getActiveId.mockResolvedValue('a');
  followed.mockResolvedValue([room]);
  service = new LiveReminderService(
    'test/reminders.json',
    { getActiveId } as unknown as AccountSessionManager,
    { followed } as unknown as HomeService,
    { load: async () => [] } as unknown as JsonSpecialFollowStore,
    logger,
    open,
  );
});
afterEach(() => {
  service.stop();
  vi.useRealTimers();
});
describe('live reminder lifecycle', () => {
  it('stays opt-in, polls centrally and stops when disabled', async () => {
    await service.start();
    expect(followed).not.toHaveBeenCalled();
    await service.configure({ enabled: true, quietEnabled: false, quietStart: 23, quietEnd: 8 });
    await vi.advanceTimersByTimeAsync(0);
    expect(state.notifications).toHaveLength(0);
    followed.mockResolvedValue([{ ...room, isLive: true }]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(state.notifications).toHaveLength(1);
    state.notifications[0]!.emit('click');
    expect(open).toHaveBeenCalledWith('1');
    await service.configure({ enabled: false, quietEnabled: false, quietStart: 23, quietEnd: 8 });
    const calls = followed.mock.calls.length;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(followed).toHaveBeenCalledTimes(calls);
  });
  it('discards a response from a previous account and avoids overlapping polls', async () => {
    await service.configure({ enabled: true, quietEnabled: false, quietStart: 23, quietEnd: 8 });
    await vi.advanceTimersByTimeAsync(0);
    let finish!: (rooms: FollowedRoom[]) => void;
    followed.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const pending = service.poll();
    await vi.advanceTimersByTimeAsync(0);
    await service.poll();
    expect(followed).toHaveBeenCalledTimes(2);
    getActiveId.mockResolvedValue('b');
    finish([{ ...room, isLive: true }]);
    await pending;
    expect(state.notifications).toHaveLength(0);
  });
  it('does not apply settings when persistence fails', async () => {
    state.write.mockRejectedValueOnce(new Error('disk full'));
    await expect(
      service.configure({ enabled: true, quietEnabled: false, quietStart: 23, quietEnd: 8 }),
    ).rejects.toThrow('disk full');
    expect(service.getSettings().enabled).toBe(false);
    expect(followed).not.toHaveBeenCalled();
  });
});
