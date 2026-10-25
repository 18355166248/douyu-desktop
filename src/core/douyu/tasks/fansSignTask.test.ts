import { describe, expect, it } from 'vitest';
import { AppError } from '../../errors';
import type { Logger } from '../../ports/Logger';
import type { TaskContext } from '../../tasks/TaskDefinition';
import { createFansSignTask, type FansSignDeps } from './fansSignTask';

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

function deps(signed: string[]): FansSignDeps {
  return {
    rooms: {
      list: async () => [
        { roomId: '1', name: '粉丝团一', level: 12 },
        { roomId: '2', name: '粉丝团二', level: 8 },
      ],
    },
    fans: {
      sign: async (roomId) => {
        signed.push(roomId);
        if (roomId === '2') throw new Error('签到失败');
        return 'signed';
      },
    },
  };
}

describe('fansSignTask', () => {
  it('reports partial success when one fan club fails', async () => {
    const signed: string[] = [];
    const task = createFansSignTask(deps(signed));
    const outcome = await task.run(context(), undefined);

    expect(signed).toEqual(['1', '2']);
    expect(outcome.status).toBe('partial');
    expect(outcome.metrics).toEqual({ total: 2, succeeded: 1, failed: 1 });
    expect(outcome.details).toMatchObject({
      failures: [{ roomId: '2', message: '签到失败' }],
    });
  });

  it('does not call sign during a dry run', async () => {
    const signed: string[] = [];
    const task = createFansSignTask(deps(signed));
    const outcome = await task.run(context(true), undefined);

    expect(signed).toEqual([]);
    expect(outcome).toMatchObject({
      status: 'success',
      metrics: { total: 2, succeeded: 0, failed: 0 },
    });
  });

  it('counts already signed rooms without failing the task', async () => {
    const task = createFansSignTask({
      rooms: { list: async () => [{ roomId: '1', name: '粉丝团一', level: 12 }] },
      fans: { sign: async () => 'already' },
    });
    const outcome = await task.run(context(), undefined);

    expect(outcome).toMatchObject({
      status: 'success',
      summary: '粉丝团签到完成，1 个今日已签到',
      metrics: { total: 1, succeeded: 1, failed: 0 },
      details: { alreadySigned: 1 },
    });
  });

  it('stops immediately when auth expires', async () => {
    const signed: string[] = [];
    const task = createFansSignTask({
      rooms: { list: async () => [{ roomId: '1', name: '粉丝团一', level: 12 }] },
      fans: {
        sign: async (roomId) => {
          signed.push(roomId);
          throw new AppError('AUTH_EXPIRED', '登录已过期');
        },
      },
    });

    await expect(task.run(context(), undefined)).rejects.toMatchObject({ code: 'AUTH_EXPIRED' });
    expect(signed).toEqual(['1']);
  });
});
