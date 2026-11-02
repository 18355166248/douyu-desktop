import type { TaskDescriptor, TaskOutcome } from '@shared/contracts/task';
import { AppError } from '../../errors';
import { sleep } from '../../tasks/sleep';
import type { TaskDefinition } from '../../tasks/TaskDefinition';
import type { YubaSignOutcome } from '../api/DouyuSignApi';
import type { YubaGroup } from '../queries/YubaFollowQuery';

export const yubaSignTaskDescriptor = {
  id: 'douyu.yuba-sign',
  title: '鱼吧签到',
  category: 'sign',
  requiresLogin: true,
  risk: 'safe',
  supportsDryRun: true,
  description: '对我加入的所有鱼吧逐个签到，先走火速签到，再按剩余补签卡补签。',
} satisfies TaskDescriptor;

export interface YubaGroupSource {
  list(signal?: AbortSignal): Promise<YubaGroup[]>;
}

export interface YubaSigner {
  yubaFastSign(signal?: AbortSignal): Promise<{ signed: number }>;
  yubaSign(groupId: string, signal?: AbortSignal): Promise<YubaSignOutcome>;
  yubaSupplement(groupId: string, signal?: AbortSignal): Promise<number>;
}

export interface YubaSignDeps {
  groups: YubaGroupSource;
  signer: YubaSigner;
}

const SIGN_ATTEMPTS = 3;
const SIGN_RETRY_DELAY_MS = 2_000;
/** 斗鱼一次最多补签几张并不固定，这里只防止意外跑成长循环。 */
const MAX_SUPPLEMENTS = 3;

function isFatal(error: unknown): boolean {
  return (
    error instanceof AppError &&
    (error.code === 'CANCELLED' || error.code === 'AUTH_EXPIRED' || error.code === 'AUTH_REQUIRED')
  );
}

async function signWithRetry(
  signer: YubaSigner,
  groupId: string,
  signal: AbortSignal,
): Promise<YubaSignOutcome> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= SIGN_ATTEMPTS; attempt += 1) {
    try {
      return await signer.yubaSign(groupId, signal);
    } catch (error) {
      if (isFatal(error)) throw error;
      lastError = error;
      if (attempt < SIGN_ATTEMPTS) await sleep(SIGN_RETRY_DELAY_MS, signal);
    }
  }
  throw lastError instanceof Error ? lastError : new AppError('UPSTREAM', '鱼吧签到失败');
}

export function createYubaSignTask(deps: YubaSignDeps): TaskDefinition {
  return {
    ...yubaSignTaskDescriptor,
    async run(ctx): Promise<TaskOutcome> {
      const groups = await deps.groups.list(ctx.signal);
      if (groups.length === 0) {
        return { status: 'skipped', summary: '没有已加入的鱼吧' };
      }

      if (ctx.dryRun) {
        return {
          status: 'success',
          summary: `将签到 ${groups.length} 个鱼吧`,
          metrics: { total: groups.length, succeeded: 0, failed: 0 },
        };
      }

      let fastSigned = 0;
      try {
        fastSigned = (await deps.signer.yubaFastSign(ctx.signal)).signed;
      } catch (error) {
        // 火速签到只是加速，失败不影响逐个签到。
        if (isFatal(error)) throw error;
        ctx.logger.warn('task.yuba-sign.fast-failed', { message: String(error) });
      }

      let succeeded = 0;
      let already = 0;
      let supplemented = 0;
      const failures: Array<{ groupId: string; message: string }> = [];

      for (let index = 0; index < groups.length; index += 1) {
        if (ctx.signal.aborted) throw new AppError('CANCELLED', '已取消');
        const group = groups[index];
        if (!group) continue;

        ctx.report({
          current: index + 1,
          total: groups.length,
          message: `签到 ${group.name}`,
        });

        try {
          const result = await signWithRetry(deps.signer, group.groupId, ctx.signal);
          if (result.status === 'already') {
            already += 1;
            continue;
          }
          succeeded += 1;

          const cards = await deps.signer.yubaSupplement(group.groupId, ctx.signal);
          const extra = Math.min(cards, MAX_SUPPLEMENTS);
          for (let card = 0; card < extra; card += 1) {
            await deps.signer.yubaSupplement(group.groupId, ctx.signal);
            supplemented += 1;
          }
        } catch (error) {
          if (isFatal(error)) throw error;
          const message = error instanceof Error ? error.message : '未知错误';
          failures.push({ groupId: group.groupId, message });
          ctx.logger.warn('task.yuba-sign.failed', { groupId: group.groupId, message });
        }
      }

      const failed = failures.length;
      const outcome: TaskOutcome = {
        status: failed === 0 ? 'success' : succeeded === 0 && already === 0 ? 'failed' : 'partial',
        summary: buildSummary({ succeeded, already, failed, fastSigned, supplemented }),
        metrics: { total: groups.length, succeeded: succeeded + already, failed },
      };
      if (failed > 0 || already > 0 || supplemented > 0) {
        outcome.details = {
          ...(failed > 0 ? { failures } : {}),
          ...(already > 0 ? { alreadySigned: already } : {}),
          ...(supplemented > 0 ? { supplemented } : {}),
          ...(fastSigned > 0 ? { fastSigned } : {}),
        };
      }
      return outcome;
    },
  };
}

function buildSummary(input: {
  succeeded: number;
  already: number;
  failed: number;
  fastSigned: number;
  supplemented: number;
}): string {
  const parts = [`鱼吧签到：成功 ${input.succeeded} 个`];
  if (input.already > 0) parts.push(`已签到 ${input.already} 个`);
  if (input.supplemented > 0) parts.push(`补签 ${input.supplemented} 张`);
  if (input.fastSigned > 0) parts.push(`火速签到 ${input.fastSigned} 个`);
  if (input.failed > 0) parts.push(`失败 ${input.failed} 个`);
  return parts.join('，');
}
