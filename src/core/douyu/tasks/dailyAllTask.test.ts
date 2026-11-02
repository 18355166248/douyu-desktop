import { describe, expect, it } from 'vitest';
import { AppError } from '../../errors';
import type { Logger } from '../../ports/Logger';
import type { TaskContext, TaskDefinition, TaskProgress } from '../../tasks/TaskDefinition';
import { createDailyAllTask } from './dailyAllTask';

const logger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function makeTask(id: string, run: TaskDefinition['run']): TaskDefinition {
  return {
    id,
    title: id.toUpperCase(),
    category: 'sign',
    risk: 'safe',
    requiresLogin: false,
    supportsDryRun: true,
    description: '',
    run,
  };
}

function makeCtx(reports: TaskProgress[] = []): TaskContext {
  return {
    logger,
    signal: new AbortController().signal,
    dryRun: false,
    report: (event) => reports.push(event),
  };
}

describe('dailyAllTask', () => {
  it('summarises every sub-task and reports one moving progress bar', async () => {
    const reports: TaskProgress[] = [];
    const task = createDailyAllTask([
      makeTask('a', async () => ({ status: 'success', summary: 'ok' })),
      makeTask('b', async () => ({ status: 'skipped', summary: 'nothing to do' })),
      makeTask('c', async () => {
        throw new AppError('UPSTREAM', 'boom');
      }),
    ]);

    const outcome = await task.run(makeCtx(reports), {});

    expect(outcome.summary).toBe('一键执行：成功 1 项，跳过 1 项，失败 1 项');
    expect(outcome.status).toBe('partial');
    expect(outcome.metrics).toEqual({ total: 3, succeeded: 1, failed: 1 });
    expect(outcome.details).toMatchObject({
      tasks: [
        { taskId: 'a', status: 'success' },
        { taskId: 'b', status: 'skipped' },
        { taskId: 'c', status: 'failed', summary: 'boom' },
      ],
    });
    expect(reports.at(-1)).toMatchObject({ current: 3, total: 3, message: '全部任务执行完毕' });
  });

  it('passes the same abort signal so cancellation stops the whole run', async () => {
    const task = createDailyAllTask([
      makeTask('a', async () => {
        throw new AppError('CANCELLED', '已取消');
      }),
      makeTask('b', async () => ({ status: 'success', summary: 'never runs' })),
    ]);

    await expect(task.run(makeCtx(), {})).rejects.toMatchObject({ code: 'CANCELLED' });
  });

  it('is skipped when it has no sub-tasks', async () => {
    const outcome = await createDailyAllTask([]).run(makeCtx(), {});
    expect(outcome.status).toBe('skipped');
  });
});
