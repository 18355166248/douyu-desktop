import type { TaskDescriptor, TaskOutcome } from '@shared/contracts/task';
import { AppError } from '../../errors';
import type { TaskDefinition } from '../../tasks/TaskDefinition';
import type { WatchPointsStatus } from '../api/DouyuClaimApi';
import type { DouyuAuthContext } from '../auth/DouyuAuthContext';

export const watchPointsTaskDescriptor = {
  id: 'douyu.watch-points',
  title: '观时积分领取',
  category: 'activity',
  requiresLogin: true,
  risk: 'safe',
  supportsDryRun: true,
  description: '领取斗鱼观时活动里已经完成、还没领取的积分奖励；活动下线时会自动跳过。',
} satisfies TaskDescriptor;

export interface WatchPointsClaimer {
  watchPointsStatus(ctn: string, signal?: AbortSignal): Promise<WatchPointsStatus>;
  watchPointsTakeGift(
    ctn: string,
    id: string,
    startTime: string,
    signal?: AbortSignal,
  ): Promise<{ claimed: boolean; message: string }>;
}

export interface WatchPointsTaskDeps {
  auth: DouyuAuthContext;
  claimer: WatchPointsClaimer;
}

export function createWatchPointsTask(deps: WatchPointsTaskDeps): TaskDefinition {
  return {
    ...watchPointsTaskDescriptor,
    async run(ctx): Promise<TaskOutcome> {
      const ctn = await deps.auth.fansCtn();
      if (!ctn) throw new AppError('AUTH_REQUIRED', '无法获取领取凭证，请重新登录斗鱼');

      const status = await deps.claimer.watchPointsStatus(ctn, ctx.signal);
      if (status.taskCount === 0) {
        return { status: 'skipped', summary: '观时积分活动暂未开放或已结束' };
      }
      if (status.claimableIds.length === 0) {
        return { status: 'skipped', summary: '观时积分暂无可领取奖励' };
      }

      if (ctx.dryRun) {
        return {
          status: 'success',
          summary: `将领取 ${status.claimableIds.length} 项观时积分`,
          metrics: { total: status.claimableIds.length, succeeded: 0, failed: 0 },
        };
      }

      let claimed = 0;
      let already = 0;
      const failures: Array<{ id: string; message: string }> = [];

      for (let index = 0; index < status.claimableIds.length; index += 1) {
        if (ctx.signal.aborted) throw new AppError('CANCELLED', '已取消');
        const id = status.claimableIds[index];
        if (!id) continue;

        ctx.report({
          current: index + 1,
          total: status.claimableIds.length,
          message: '领取观时积分',
        });

        try {
          const result = await deps.claimer.watchPointsTakeGift(
            ctn,
            id,
            status.startTime,
            ctx.signal,
          );
          if (result.claimed) claimed += 1;
          else already += 1;
        } catch (error) {
          if (
            error instanceof AppError &&
            (error.code === 'AUTH_EXPIRED' || error.code === 'AUTH_REQUIRED')
          ) {
            throw error;
          }
          const message = error instanceof Error ? error.message : '未知错误';
          failures.push({ id, message });
          ctx.logger.warn('task.watch-points.failed', { id, message });
        }
      }

      const failed = failures.length;
      const outcome: TaskOutcome = {
        status: failed === 0 ? 'success' : claimed === 0 ? 'failed' : 'partial',
        summary: buildSummary(claimed, already, failed),
        metrics: {
          total: status.claimableIds.length,
          succeeded: claimed + already,
          failed,
        },
      };
      if (failed > 0 || already > 0) {
        outcome.details = {
          ...(failed > 0 ? { failures } : {}),
          ...(already > 0 ? { alreadyClaimed: already } : {}),
        };
      }
      return outcome;
    },
  };
}

function buildSummary(claimed: number, already: number, failed: number): string {
  const parts = [`观时积分：领取 ${claimed} 项`];
  if (already > 0) parts.push(`已领过 ${already} 项`);
  if (failed > 0) parts.push(`失败 ${failed} 项`);
  return parts.join('，');
}
