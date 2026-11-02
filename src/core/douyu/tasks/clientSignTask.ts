import type { TaskDescriptor, TaskOutcome } from '@shared/contracts/task';
import type { TaskDefinition } from '../../tasks/TaskDefinition';
import type { ClientSignOutcome } from '../api/DouyuSignApi';

export const clientSignTaskDescriptor = {
  id: 'douyu.client-sign',
  title: '客户端签到',
  category: 'sign',
  risk: 'safe',
  requiresLogin: true,
  supportsDryRun: true,
  description: '领取斗鱼客户端每日签到奖励（鱼丸、荧光棒等）；今天签过会直接跳过。',
} satisfies TaskDescriptor;

export interface ClientSigner {
  clientSign(signal?: AbortSignal): Promise<ClientSignOutcome>;
}

export function createClientSignTask(deps: { sign: ClientSigner }): TaskDefinition {
  return {
    ...clientSignTaskDescriptor,
    async run(ctx): Promise<TaskOutcome> {
      if (ctx.dryRun) {
        return { status: 'success', summary: '将执行客户端签到' };
      }

      ctx.report({ current: 0, total: 1, message: '客户端签到' });
      const result = await deps.sign.clientSign(ctx.signal);

      if (result.status === 'already') {
        return { status: 'skipped', summary: '客户端签到：今日已签到' };
      }

      const reward = result.items.length > 0 ? `，获得 ${result.items.join('、')}` : '';
      return {
        status: 'success',
        summary: `客户端签到成功${reward}`,
        metrics: { total: 1, succeeded: 1, failed: 0 },
      };
    },
  };
}
