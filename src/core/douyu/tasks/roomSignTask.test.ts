import { describe, expect, it } from 'vitest';
import type { Logger } from '../../ports/Logger';
import type { TaskContext } from '../../tasks/TaskDefinition';
import { AppError } from '../../errors';
import { createRoomSignTask, type RoomSignDeps } from './roomSignTask';

const logger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function context(dryRun = false): TaskContext {
  return {
    logger,
    signal: new AbortController().signal,
    dryRun,
    report: () => undefined,
  };
}

function deps(checked: string[]): RoomSignDeps {
  return {
    rooms: {
      list: async () => [
        { roomId: '1', name: '房间一', isLive: true },
        { roomId: '2', name: '房间二', isLive: true },
      ],
    },
    roomApi: {
      checkIn: async (roomId) => {
        checked.push(roomId);
        if (roomId === '2') throw new Error('签到失败');
      },
    },
  };
}

describe('roomSignTask', () => {
  it('reports partial success when one room fails', async () => {
    const checked: string[] = [];
    const task = createRoomSignTask(deps(checked));
    const outcome = await task.run(context(), { liveOnly: true });

    expect(checked).toEqual(['1', '2']);
    expect(outcome.status).toBe('partial');
    expect(outcome.metrics).toEqual({ total: 2, succeeded: 1, failed: 1 });
    expect(outcome.details).toMatchObject({
      failures: [{ roomId: '2', message: '签到失败' }],
    });
  });

  it('does not call checkIn during dry run', async () => {
    const checked: string[] = [];
    const task = createRoomSignTask(deps(checked));
    const outcome = await task.run(context(true), { liveOnly: true });

    expect(checked).toEqual([]);
    expect(outcome).toMatchObject({
      status: 'success',
      metrics: { total: 2, succeeded: 0, failed: 0 },
    });
  });

  it('stops immediately when auth expires', async () => {
    const checked: string[] = [];
    const task = createRoomSignTask({
      rooms: { list: async () => [{ roomId: '1', name: '房间一', isLive: true }] },
      roomApi: {
        checkIn: async (roomId) => {
          checked.push(roomId);
          throw new AppError('AUTH_EXPIRED', '登录已过期');
        },
      },
    });

    await expect(task.run(context(), { liveOnly: true })).rejects.toMatchObject({
      code: 'AUTH_EXPIRED',
    });
    expect(checked).toEqual(['1']);
  });
});
