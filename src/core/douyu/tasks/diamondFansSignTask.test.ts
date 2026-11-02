import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../errors';
import type { Logger } from '../../ports/Logger';
import type { TaskContext } from '../../tasks/TaskDefinition';
import { createDiamondFansSignTask } from './diamondFansSignTask';

const logger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const auth = {
  headers: async () => ({}),
  csrfToken: async () => '',
  fansCtn: async () => 'ctn',
};

function makeCtx(dryRun = false): TaskContext {
  return { logger, signal: new AbortController().signal, dryRun, report: () => undefined };
}

const rooms = {
  list: async () => [
    { roomId: '1', name: '甲', level: 8 },
    { roomId: '2', name: '乙', level: 3 },
  ],
};

describe('diamondFansSignTask', () => {
  it('records per-room failures but still signs the rest', async () => {
    const diamondFansSign = vi.fn(async (roomId: string) => {
      if (roomId === '1') throw new AppError('UPSTREAM', '系统繁忙');
      return { signed: 1, message: '' };
    });

    const task = createDiamondFansSignTask({ rooms, auth, signer: { diamondFansSign } });
    const outcome = await task.run(makeCtx(), {});

    expect(outcome.status).toBe('partial');
    expect(outcome.metrics).toEqual({ total: 2, succeeded: 1, failed: 1 });
    expect(outcome.details).toMatchObject({
      failures: [{ roomId: '1', message: '系统繁忙' }],
    });
  });

  it('counts already-signed rooms separately', async () => {
    const task = createDiamondFansSignTask({
      rooms,
      auth,
      signer: {
        diamondFansSign: async () => ({ signed: 0, message: '今日已签到' }),
      },
    });

    const outcome = await task.run(makeCtx(), {});

    expect(outcome.status).toBe('success');
    expect(outcome.summary).toContain('已签到 2 个');
  });

  it('stops the whole run when the login expired', async () => {
    const task = createDiamondFansSignTask({
      rooms,
      auth,
      signer: {
        diamondFansSign: async () => {
          throw new AppError('AUTH_EXPIRED', '请重新登录斗鱼');
        },
      },
    });

    await expect(task.run(makeCtx(), {})).rejects.toMatchObject({ code: 'AUTH_EXPIRED' });
  });

  it('skips without rooms and stays offline during a dry run', async () => {
    const diamondFansSign = vi.fn();
    const empty = createDiamondFansSignTask({
      rooms: { list: async () => [] },
      auth,
      signer: { diamondFansSign },
    });
    await expect(empty.run(makeCtx(), {})).resolves.toMatchObject({ status: 'skipped' });

    const task = createDiamondFansSignTask({ rooms, auth, signer: { diamondFansSign } });
    const outcome = await task.run(makeCtx(true), {});
    expect(outcome.summary).toBe('将在 2 个粉丝团签到');
    expect(diamondFansSign).not.toHaveBeenCalled();
  });
});
