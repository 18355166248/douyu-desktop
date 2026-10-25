import type { TaskDescriptor, TaskOutcome } from '@shared/contracts/task';
import { AppError } from '../../errors';
import type { TaskDefinition } from '../../tasks/TaskDefinition';
import type { FansBadgeRoom } from '../queries/FansBadgeQuery';
import type { FansSignResult } from '../api/DouyuFansApi';

export const fansSignTaskDescriptor = {
  id: 'douyu.fans-sign',
  title: '粉丝团签到',
  category: 'sign',
  risk: 'safe',
  requiresLogin: true,
  supportsDryRun: true,
  description: '签到已加入粉丝团的直播间；斗鱼房间签到已下线，粉丝团每日打卡是其替代入口。',
} satisfies TaskDescriptor;

export interface FansRoomSource {
  list(signal?: AbortSignal): Promise<FansBadgeRoom[]>;
}

export interface FansSigner {
  sign(roomId: string, signal?: AbortSignal): Promise<FansSignResult>;
}

export interface FansSignDeps {
  rooms: FansRoomSource;
  fans: FansSigner;
}

export function createFansSignTask(deps: FansSignDeps): TaskDefinition {
  return {
    ...fansSignTaskDescriptor,
    async run(ctx): Promise<TaskOutcome> {
      const rooms = await deps.rooms.list(ctx.signal);

      if (rooms.length === 0) {
        return { status: 'skipped', summary: '没有已加入粉丝团的直播间' };
      }

      if (ctx.dryRun) {
        return {
          status: 'success',
          summary: `将签到 ${rooms.length} 个粉丝团`,
          metrics: { total: rooms.length, succeeded: 0, failed: 0 },
        };
      }

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
          message: `签到 ${room.name}`,
        });

        try {
          const result = await deps.fans.sign(room.roomId, ctx.signal);
          if (result === 'signed') succeeded += 1;
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
          ctx.logger.warn('task.fans-sign.failed', { roomId: room.roomId, message });
        }
      }

      const failed = failures.length;
      const outcome: TaskOutcome = {
        status: failed === 0 ? 'success' : succeeded === 0 ? 'failed' : 'partial',
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
  if (failed === 0) {
    if (succeeded === 0) return `粉丝团签到完成，${already} 个今日已签到`;
    return already > 0
      ? `粉丝团签到完成，共 ${succeeded} 个，${already} 个今日已签到`
      : `粉丝团签到完成，共 ${succeeded} 个`;
  }
  if (succeeded === 0) return `粉丝团签到失败 ${failed} 个`;
  return `签到完成 ${succeeded} 个，失败 ${failed} 个`;
}
