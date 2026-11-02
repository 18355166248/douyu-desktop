import type { TaskDescriptor, TaskOutcome, TaskStatus } from '@shared/contracts/task';
import { AppError } from '../../errors';
import type { TaskContext, TaskDefinition } from '../../tasks/TaskDefinition';

export const dailyAllTaskDescriptor = {
  id: 'douyu.daily-all',
  title: '一键全部执行',
  category: 'activity',
  requiresLogin: true,
  risk: 'safe',
  supportsDryRun: true,
  description: '依次执行粉丝团签到、客户端签到、鱼吧签到、钻粉联赛签到和观时积分领取。',
} satisfies TaskDescriptor;

interface SubTaskOutcome {
  taskId: string;
  title: string;
  status: TaskStatus;
  summary: string;
}

function combineStatus(outcomes: readonly SubTaskOutcome[]): TaskStatus {
  if (outcomes.length === 0) return 'skipped';
  const failed = outcomes.filter((outcome) => outcome.status === 'failed').length;
  const done = outcomes.filter(
    (outcome) => outcome.status === 'success' || outcome.status === 'partial',
  ).length;
  if (failed === 0) {
    if (done === 0) return 'skipped';
    return outcomes.some((outcome) => outcome.status === 'partial') ? 'partial' : 'success';
  }
  return done === 0 ? 'failed' : 'partial';
}

function isFatal(error: unknown): boolean {
  return (
    error instanceof AppError &&
    (error.code === 'CANCELLED' || error.code === 'AUTH_EXPIRED' || error.code === 'AUTH_REQUIRED')
  );
}

/**
 * Runs the daily sign/claim tasks in sequence under one run id, so the task
 * center reports one progress bar and one summary instead of five runs.
 */
export function createDailyAllTask(subTasks: readonly TaskDefinition[]): TaskDefinition {
  return {
    ...dailyAllTaskDescriptor,
    async run(ctx): Promise<TaskOutcome> {
      const outcomes: SubTaskOutcome[] = [];

      for (let index = 0; index < subTasks.length; index += 1) {
        if (ctx.signal.aborted) throw new AppError('CANCELLED', '已取消');
        const task = subTasks[index];
        if (!task) continue;

        ctx.report({
          current: index,
          total: subTasks.length,
          message: `执行 ${task.title}`,
        });

        // Nest the sub-task progress inside the overall bar so the UI shows one
        // moving total rather than every task restarting from zero.
        const scoped: TaskContext = {
          ...ctx,
          report: (event) =>
            ctx.report({
              current: index,
              total: subTasks.length,
              message: `${task.title}：${event.message}`,
            }),
        };

        try {
          const outcome = await task.run(scoped, {});
          outcomes.push({
            taskId: task.id,
            title: task.title,
            status: outcome.status,
            summary: outcome.summary,
          });
        } catch (error) {
          if (isFatal(error)) throw error;
          const summary = error instanceof Error ? error.message : '未知错误';
          ctx.logger.warn('task.daily-all.failed', { taskId: task.id, message: summary });
          outcomes.push({ taskId: task.id, title: task.title, status: 'failed', summary });
        }
      }

      ctx.report({ current: subTasks.length, total: subTasks.length, message: '全部任务执行完毕' });

      const succeeded = outcomes.filter(
        (outcome) => outcome.status === 'success' || outcome.status === 'partial',
      ).length;
      const skipped = outcomes.filter((outcome) => outcome.status === 'skipped').length;
      const failed = outcomes.filter((outcome) => outcome.status === 'failed').length;

      return {
        status: combineStatus(outcomes),
        summary: `一键执行：成功 ${succeeded} 项，跳过 ${skipped} 项，失败 ${failed} 项`,
        metrics: { total: outcomes.length, succeeded, failed },
        details: { tasks: outcomes },
      };
    },
  };
}
