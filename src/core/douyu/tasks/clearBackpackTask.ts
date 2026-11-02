import { z } from 'zod';
import type { TaskDescriptor, TaskOutcome } from '@shared/contracts/task';
import { AppError } from '../../errors';
import { sleep } from '../../tasks/sleep';
import type { TaskContext, TaskDefinition } from '../../tasks/TaskDefinition';
import type { BackpackGift, BackpackSummary } from '../api/DouyuBackpackApi';

export const clearBackpackTaskDescriptor = {
  id: 'douyu.clear-backpack',
  title: '清空背包',
  category: 'bag',
  risk: 'confirm',
  requiresLogin: true,
  supportsDryRun: true,
  description:
    '把背包里的礼物全部送给当前直播间（消耗背包物品，不花鱼翅）；支持批量送的一起送，其余逐个送，执行前需要确认。',
} satisfies TaskDescriptor;

export const clearBackpackOptionsSchema = z.object({
  roomId: z
    .string()
    .trim()
    .regex(/^\d{1,16}$/, '请先打开一个斗鱼直播间再清空背包'),
});

export interface BackpackSender {
  list(roomId: string, signal?: AbortSignal): Promise<BackpackSummary>;
  donate(
    roomId: string,
    propId: string,
    count: number,
    signal?: AbortSignal,
  ): Promise<{ ok: boolean; message: string }>;
}

export interface ClearBackpackDeps {
  backpack: BackpackSender;
}

/** 送礼节流：斗鱼对连续送礼有风控，douyuEx 也是 100ms 起步。 */
const SEND_INTERVAL_MS = 150;
/** 单次最多送出的件数，防止背包里堆了几千个时跑失控。 */
const MAX_UNITS = 1_000;
const MAX_FAILURES = 8;

interface GiftFailure {
  propId: string;
  name: string;
  count: number;
  message: string;
}

function isFatal(error: unknown): boolean {
  return (
    error instanceof AppError &&
    (error.code === 'CANCELLED' || error.code === 'AUTH_EXPIRED' || error.code === 'AUTH_REQUIRED')
  );
}

function valueLabel(valueYuan: number): string {
  return valueYuan > 0 ? `（价值约 ￥${valueYuan.toFixed(2)}）` : '';
}

/**
 * 清空背包：把当前直播间可用的背包礼物全部送出。`batchInfo` 非空的礼物斗鱼
 * 支持一次送完全部数量，其余只能一遍一个地送。
 */
export function createClearBackpackTask(deps: ClearBackpackDeps): TaskDefinition {
  return {
    ...clearBackpackTaskDescriptor,
    optionsSchema: clearBackpackOptionsSchema,
    async run(ctx, options): Promise<TaskOutcome> {
      const { roomId } = clearBackpackOptionsSchema.parse(options);
      const summary = await deps.backpack.list(roomId, ctx.signal);

      if (summary.units === 0) {
        return { status: 'skipped', summary: '背包里没有可送出的礼物' };
      }

      const total = Math.min(summary.units, MAX_UNITS);
      const truncated = summary.units > MAX_UNITS;

      if (ctx.dryRun) {
        return {
          status: 'success',
          summary: `将送出 ${total} 个背包礼物${valueLabel(summary.valueYuan)}`,
          metrics: { total, succeeded: 0, failed: 0 },
          details: { roomId, gifts: giftSnapshot(summary.gifts), truncated },
        };
      }

      let sent = 0;
      let failed = 0;
      let budget = MAX_UNITS;
      const failures: GiftFailure[] = [];

      for (const gift of summary.gifts) {
        if (budget <= 0) break;
        if (ctx.signal.aborted) throw new AppError('CANCELLED', '已取消');

        ctx.report({ current: sent + failed, total, message: `送出 ${gift.name}` });

        if (gift.batchable) {
          const count = Math.min(gift.count, budget);
          const outcome = await send(ctx, () => deps.backpack.donate(roomId, gift.propId, count, ctx.signal));
          budget -= count;
          if (outcome.ok) {
            sent += count;
          } else {
            failed += count;
            pushFailure(failures, gift, count, outcome.message);
          }
          ctx.report({ current: sent + failed, total, message: `送出 ${gift.name}` });
          if (budget > 0) await sleep(SEND_INTERVAL_MS, ctx.signal);
          continue;
        }

        for (let unit = 0; unit < gift.count && budget > 0; unit += 1) {
          const outcome = await send(ctx, () => deps.backpack.donate(roomId, gift.propId, 1, ctx.signal));
          budget -= 1;
          if (outcome.ok) sent += 1;
          else {
            failed += 1;
            pushFailure(failures, gift, 1, outcome.message);
          }
          ctx.report({ current: sent + failed, total, message: `送出 ${gift.name}` });
          if (budget > 0) await sleep(SEND_INTERVAL_MS, ctx.signal);
        }
      }

      const status = failed === 0 ? 'success' : sent === 0 ? 'failed' : 'partial';
      const outcome: TaskOutcome = {
        status,
        summary: buildSummary(sent, failed, summary.valueYuan, truncated),
        metrics: { total, succeeded: sent, failed },
        details: {
          roomId,
          gifts: giftSnapshot(summary.gifts),
          ...(failures.length > 0 ? { failures } : {}),
          ...(truncated ? { truncated: true } : {}),
        },
      };
      return outcome;
    },
  };
}

function giftSnapshot(gifts: readonly BackpackGift[]): Array<{ name: string; count: number }> {
  return gifts.map((gift) => ({ name: gift.name, count: gift.count }));
}

function pushFailure(
  failures: GiftFailure[],
  gift: BackpackGift,
  count: number,
  message: string,
): void {
  if (failures.length >= MAX_FAILURES) return;
  failures.push({ propId: gift.propId, name: gift.name, count, message });
}

async function send(
  ctx: TaskContext,
  run: () => Promise<{ ok: boolean; message: string }>,
): Promise<{ ok: boolean; message: string }> {
  try {
    return await run();
  } catch (error) {
    if (isFatal(error)) throw error;
    const message = error instanceof Error ? error.message : '赠送失败';
    ctx.logger.warn('task.clear-backpack.send-failed', { message });
    return { ok: false, message };
  }
}

function buildSummary(
  sent: number,
  failed: number,
  valueYuan: number,
  truncated: boolean,
): string {
  const parts = [`清空背包：送出 ${sent} 个礼物${valueLabel(valueYuan)}`];
  if (failed > 0) parts.push(`失败 ${failed} 个`);
  if (truncated) parts.push(`单次最多送 ${MAX_UNITS} 个，剩余留到下次`);
  return parts.join('，');
}
