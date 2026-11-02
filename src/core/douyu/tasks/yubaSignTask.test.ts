import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '../../ports/Logger';
import type { TaskContext } from '../../tasks/TaskDefinition';
import { createYubaSignTask } from './yubaSignTask';

const logger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function makeCtx(dryRun = false): TaskContext {
  return {
    logger,
    signal: new AbortController().signal,
    dryRun,
    report: () => undefined,
  };
}

describe('yubaSignTask', () => {
  it('signs every group and consumes the remaining supplement cards', async () => {
    const groups = {
      list: async () => [
        { groupId: '1', name: '甲' },
        { groupId: '2', name: '乙' },
      ],
    };
    const yubaSign = vi.fn(async (groupId: string) =>
      groupId === '2'
        ? { status: 'already' as const, exp: null, continuousDays: null }
        : { status: 'signed' as const, exp: 5, continuousDays: 2 },
    );
    const yubaSupplement = vi.fn(async () => 1);
    const yubaFastSign = vi.fn(async () => ({ signed: 3 }));

    const task = createYubaSignTask({ groups, signer: { yubaSign, yubaSupplement, yubaFastSign } });
    const outcome = await task.run(makeCtx(), {});

    expect(outcome.status).toBe('success');
    expect(outcome.summary).toContain('成功 1 个');
    expect(outcome.summary).toContain('已签到 1 个');
    expect(outcome.summary).toContain('补签 1 张');
    expect(outcome.metrics).toEqual({ total: 2, succeeded: 2, failed: 0 });
    expect(yubaSign).toHaveBeenCalledTimes(2);
    // 一次取补签卡数量，一次真正补签。
    expect(yubaSupplement).toHaveBeenCalledTimes(2);
  });

  it('does not touch the network for a dry run', async () => {
    const yubaSign = vi.fn();
    const yubaSupplement = vi.fn();
    const yubaFastSign = vi.fn();
    const task = createYubaSignTask({
      groups: { list: async () => [{ groupId: '1', name: '甲' }] },
      signer: { yubaSign, yubaSupplement, yubaFastSign },
    });

    const outcome = await task.run(makeCtx(true), {});

    expect(outcome.summary).toBe('将签到 1 个鱼吧');
    expect(yubaSign).not.toHaveBeenCalled();
    expect(yubaSupplement).not.toHaveBeenCalled();
    expect(yubaFastSign).not.toHaveBeenCalled();
  });

  it('skips when the account joined no yuba groups', async () => {
    const task = createYubaSignTask({
      groups: { list: async () => [] },
      signer: {
        yubaSign: vi.fn(),
        yubaSupplement: vi.fn(),
        yubaFastSign: vi.fn(),
      },
    });

    await expect(task.run(makeCtx(), {})).resolves.toMatchObject({ status: 'skipped' });
  });

  it('keeps signing when the fast-sign shortcut fails', async () => {
    const yubaSign = vi.fn(async () => ({
      status: 'signed' as const,
      exp: 5,
      continuousDays: 1,
    }));
    const task = createYubaSignTask({
      groups: { list: async () => [{ groupId: '1', name: '甲' }] },
      signer: {
        yubaSign,
        yubaSupplement: async () => 0,
        yubaFastSign: async () => {
          throw new Error('fast sign unavailable');
        },
      },
    });

    const outcome = await task.run(makeCtx(), {});

    expect(outcome.status).toBe('success');
    expect(outcome.summary).not.toContain('火速签到');
  });
});
