import type { TaskDescriptor, TaskOutcome } from '@shared/contracts/task';
import { AppError } from '../../errors';
import type { TaskDefinition } from '../../tasks/TaskDefinition';
import type { FansBadgeRoom } from '../queries/FansBadgeQuery';
import type { DouyuAuthContext } from '../auth/DouyuAuthContext';

export const diamondFansSignTaskDescriptor = {
  id: 'douyu.diamond-fans-sign',
  title: '钻粉联赛签到',
  category: 'fans',
  requiresLogin: true,
  risk: 'safe',
  supportsDryRun: true,
  description: '在已加入粉丝团的直播间逐个完成钻粉联赛签到。',
} satisfies TaskDescriptor;

export interface DiamondFansRoomSource {
  list(signal?: AbortSignal): Promise<FansBadgeRoom[]>;
}

export interface DiamondFansSigner {
  diamondFansSign(
    roomId: string,
    ctn: string,
    signal?: AbortSignal,
  ): Promise<{ signed: number; message: string }>;
}

export interface DiamondFansSignDeps {
  rooms: DiamondFansRoomSource;
  auth: DouyuAuthContext;
  signer: DiamondFansSigner;
}

export function createDiamondFansSignTask(deps: DiamondFansSignDeps): TaskDefinition {
  return {
    ...diamondFansSignTaskDescriptor,
    async run(ctx): Promise<TaskOutcome> {
      const rooms = await deps.rooms.list(ctx.signal);
      if (rooms.length === 0) {
        return { status: 'skipped', summary: '没有已加入粉丝团的直播间' };
      }

      if (ctx.dryRun) {
        return {
          status: 'success',
          summary: `将在 ${rooms.length} 个粉丝团签到`,
          metrics: { total: rooms.length, succeeded: 0, failed: 0 },
        };
      }

      const ctn = await deps.auth.fansCtn();
      if (!ctn) throw new AppError('AUTH_REQUIRED', '无法获取签到凭证，请重新登录斗鱼');

      let succeeded = 0;
      let already = 0;
      const failures: Array<{ roomId: string; message: string }> = [];

      for (let index = 0; index < rooms.length; index += 1) {
        if (ctx.signal.aborted) throw new AppError('CANCELLED', '已取消');
        const room = rooms[index];
        if (!room) continue;

        ctx.report({
          current: index + 1,
          total: rooms.length,
          message: `钻粉联赛签到 ${room.name}`,
        });

        try {
          const result = await deps.signer.diamondFansSign(room.roomId, ctn, ctx.signal);
          if (result.signed > 0) succeeded += 1;
          else already += 1;
        } catch (error) {
          if (
            error instanceof AppError &&
            (error.code === 'AUTH_EXPIRED' || error.code === 'AUTH_REQUIRED')
          ) {
            throw error;
          }
          const message = error instanceof Error ? error.message : '未知错误';
          failures.push({ roomId: room.roomId, message });
          ctx.logger.warn('task.diamond-fans-sign.failed', { roomId: room.roomId, message });
        }
      }

      const failed = failures.length;
      const outcome: TaskOutcome = {
        status: failed === 0 ? 'success' : succeeded === 0 && already === 0 ? 'failed' : 'partial',
        summary: buildSummary(succeeded, already, failed),
        metrics: { total: rooms.length, succeeded: succeeded + already, failed },
      };
      if (failed > 0 || already > 0) {
        outcome.details = {
          ...(failed > 0 ? { failures } : {}),
          ...(already > 0 ? { alreadySigned: already } : {}),
        };
      }
      return outcome;
    },
  };
}

function buildSummary(succeeded: number, already: number, failed: number): string {
  const parts = [`钻粉联赛签到：成功 ${succeeded} 个`];
  if (already > 0) parts.push(`已签到 ${already} 个`);
  if (failed > 0) parts.push(`失败 ${failed} 个`);
  return parts.join('，');
}
