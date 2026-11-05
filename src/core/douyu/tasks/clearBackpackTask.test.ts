import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '../../ports/Logger';
import type { TaskContext } from '../../tasks/TaskDefinition';
import type { BackpackSummary } from '../api/DouyuBackpackApi';
import { createClearBackpackTask } from './clearBackpackTask';

const logger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function makeCtx(dryRun = false): TaskContext {
  return { logger, signal: new AbortController().signal, dryRun, report: () => undefined };
}

function summary(gifts: BackpackSummary['gifts']): BackpackSummary {
  return {
    gifts,
    units: gifts.reduce((total, gift) => total + gift.count, 0),
    valueYuan: 0,
    intimate: 0,
  };
}

const batchableGift = {
  propId: '2358',
  name: '弱鸡',
  count: 5,
  batchable: true,
  price: 0,
  intimate: 1,
  valuable: false,
};

const unitGift = {
  propId: '268',
  name: '荧光棒',
  count: 2,
  batchable: false,
  price: 0,
  intimate: 1,
  valuable: false,
};

describe('clearBackpackTask', () => {
  it('sends batchable gifts at once and the rest one by one', async () => {
    const donate = vi.fn(async () => ({ ok: true, message: 'success' }));
    const task = createClearBackpackTask({
      backpack: { list: async () => summary([batchableGift, unitGift]), donate },
    });

    const outcome = await task.run(makeCtx(), { roomId: '9999' });

    expect(outcome.status).toBe('success');
    expect(outcome.metrics).toEqual({ total: 7, succeeded: 7, failed: 0 });
    expect(donate.mock.calls.map((call) => call.slice(0, 3))).toEqual([
      ['9999', '2358', 5],
      ['9999', '268', 1],
      ['9999', '268', 1],
    ]);
  });

  it('skips an empty backpack without sending anything', async () => {
    const donate = vi.fn();
    const task = createClearBackpackTask({
      backpack: { list: async () => summary([]), donate },
    });

    const outcome = await task.run(makeCtx(), { roomId: '9999' });

    expect(outcome).toMatchObject({ status: 'skipped' });
    expect(donate).not.toHaveBeenCalled();
  });

  it('plans without sending during a dry run', async () => {
    const donate = vi.fn();
    const task = createClearBackpackTask({
      backpack: { list: async () => summary([batchableGift, unitGift]), donate },
    });

    const outcome = await task.run(makeCtx(true), { roomId: '9999' });

    expect(outcome.summary).toBe('将送出 7 个背包礼物');
    expect(donate).not.toHaveBeenCalled();
  });

  it('records per-gift failures but keeps sending the rest', async () => {
    const donate = vi.fn(async (roomId: string, propId: string) =>
      propId === '2358' ? { ok: false, message: '礼物数量不足' } : { ok: true, message: 'success' },
    );
    const task = createClearBackpackTask({
      backpack: { list: async () => summary([batchableGift, unitGift]), donate },
    });

    const outcome = await task.run(makeCtx(), { roomId: '9999' });

    expect(outcome.status).toBe('partial');
    expect(outcome.summary).toContain('原因：礼物数量不足');
    expect(outcome.metrics).toEqual({ total: 7, succeeded: 2, failed: 5 });
    expect(outcome.details).toMatchObject({
      failures: [{ propId: '2358', count: 5, message: '礼物数量不足' }],
    });
  });

  it('rejects a run without a target room', async () => {
    const task = createClearBackpackTask({
      backpack: { list: vi.fn(), donate: vi.fn() },
    });

    await expect(task.run(makeCtx(), {})).rejects.toThrowError();
  });
});
