import { describe, expect, it } from 'vitest';
import type { Logger } from '../ports/Logger';
import { AppError } from '../errors';
import type { TaskDefinition } from './TaskDefinition';
import { TaskRegistry } from './TaskRegistry';
import { TaskRunner } from './TaskRunner';

const logger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function baseTask(overrides: Partial<TaskDefinition> = {}): TaskDefinition {
  return {
    id: 'test',
    title: '测试任务',
    category: 'sign',
    risk: 'safe',
    requiresLogin: false,
    supportsDryRun: true,
    description: '测试',
    async run(ctx) {
      ctx.report({ current: 1, total: 2, message: '第一步' });
      return { status: 'success', summary: '完成' };
    },
    ...overrides,
  };
}

describe('TaskRunner', () => {
  it('runs a task and forwards progress', async () => {
    const events: string[] = [];
    const runner = new TaskRunner(new TaskRegistry([baseTask()]), logger);
    const result = await runner.run({ taskId: 'test' }, (event) => {
      events.push(`${event.current}/${event.total}:${event.message}`);
    });

    expect(result.status).toBe('success');
    expect(result.summary).toBe('完成');
    expect(events).toEqual(['1/2:第一步']);
    expect(result.runId).toMatch(/^run-/);
  });

  it('requires confirmation for confirm-risk tasks', async () => {
    const runner = new TaskRunner(
      new TaskRegistry([baseTask({ id: 'danger', risk: 'confirm' })]),
      logger,
    );

    await expect(runner.run({ taskId: 'danger' })).rejects.toMatchObject({
      code: 'CONFIRM_REQUIRED',
    });
  });

  it('converts timeout cancellation to skipped', async () => {
    const cancelTask = baseTask({
      id: 'cancel',
      run: (ctx) =>
        new Promise((_resolve, reject) => {
          ctx.signal.addEventListener('abort', () => reject(new AppError('CANCELLED', '已取消')), {
            once: true,
          });
        }),
    });
    const runner = new TaskRunner(new TaskRegistry([cancelTask]), logger, {
      timeoutMs: 10,
    });

    const result = await runner.run({ taskId: 'cancel' });
    expect(result.status).toBe('skipped');
    expect(result.summary).toBe('已取消');
  });
});
