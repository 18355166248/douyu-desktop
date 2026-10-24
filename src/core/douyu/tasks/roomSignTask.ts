import { z } from 'zod';
import type { TaskDescriptor, TaskOutcome } from '@shared/contracts/task';
import { AppError } from '../../errors';
import type { TaskDefinition } from '../../tasks/TaskDefinition';
import type { FollowedRoom, FollowedRoomsOptions } from '../queries/FollowedRoomsQuery';

export const roomSignOptionsSchema = z.object({
  liveOnly: z.boolean().default(false),
});

export type RoomSignOptions = z.infer<typeof roomSignOptionsSchema>;

export const roomSignTaskDescriptor = {
  id: 'douyu.room-sign',
  title: '房间签到',
  category: 'sign',
  risk: 'safe',
  requiresLogin: true,
  supportsDryRun: true,
  description: '签到关注的直播间；可只签到正在直播的房间。',
} satisfies TaskDescriptor;

export interface RoomSource {
  list(options: FollowedRoomsOptions): Promise<FollowedRoom[]>;
}

export interface RoomSigner {
  checkIn(roomId: string, signal?: AbortSignal): Promise<void>;
}

export interface RoomSignDeps {
  rooms: RoomSource;
  roomApi: RoomSigner;
}

export function createRoomSignTask(deps: RoomSignDeps): TaskDefinition {
  return {
    ...roomSignTaskDescriptor,
    optionsSchema: roomSignOptionsSchema,
    async run(ctx, rawOptions): Promise<TaskOutcome> {
      const options = roomSignOptionsSchema.parse(rawOptions);
      const rooms = await deps.rooms.list({ liveOnly: options.liveOnly, signal: ctx.signal });

      if (rooms.length === 0) {
        return { status: 'skipped', summary: '没有可签到的房间' };
      }

      if (ctx.dryRun) {
        return {
          status: 'success',
          summary: `将签到 ${rooms.length} 个房间${options.liveOnly ? '（仅开播）' : ''}`,
          metrics: { total: rooms.length, succeeded: 0, failed: 0 },
        };
      }

      let succeeded = 0;
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
          await deps.roomApi.checkIn(room.roomId, ctx.signal);
          succeeded += 1;
        } catch (error) {
          if (
            error instanceof AppError &&
            (error.code === 'AUTH_EXPIRED' || error.code === 'AUTH_REQUIRED')
          ) {
            throw error;
          }
          const message = error instanceof Error ? error.message : '未知错误';
          failures.push({ roomId: room.roomId, message });
          ctx.logger.warn('task.room-sign.failed', { roomId: room.roomId, message });
        }
      }

      const failed = failures.length;
      const outcome: TaskOutcome = {
        status: failed === 0 ? 'success' : succeeded === 0 ? 'failed' : 'partial',
        summary:
          failed === 0
            ? `房间签到完成，共 ${succeeded} 个`
            : `签到完成 ${succeeded} 个，失败 ${failed} 个`,
        metrics: { total: rooms.length, succeeded, failed },
      };
      if (failed > 0) outcome.details = { failures };
      return outcome;
    },
  };
}
