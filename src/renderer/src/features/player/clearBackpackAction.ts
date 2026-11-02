import type { RunTaskInput, TaskRunResult } from '@shared/contracts/task';

/** 清空背包不是「任务列表」里的一项，而是直播卡片上的一个动作。 */
export const CLEAR_BACKPACK_TASK_ID = 'douyu.clear-backpack';

/** 二次确认的保持时间，和「清空历史」保持一致。 */
export const CLEAR_BACKPACK_CONFIRM_MS = 3_000;

/** 结果提示停留时间；浮层里展示完就自动收起，避免一直挡着直播画面。 */
export const CLEAR_BACKPACK_RESULT_MS = 4_000;

/**
 * 清空背包一定会把礼物送出去，所以请求里固定带 `confirmed`；
 * `dryRun` 只在用户显式预览时打开。
 */
export function buildClearBackpackInput(roomId: string, dryRun = false): RunTaskInput {
  return {
    taskId: CLEAR_BACKPACK_TASK_ID,
    options: { roomId },
    confirmed: true,
    dryRun,
  };
}

export type ClearBackpackTone = 'success' | 'partial' | 'failed' | 'skipped';

export interface ClearBackpackOutcome {
  tone: ClearBackpackTone;
  text: string;
}

export interface ClearBackpackPreview {
  /** 背包里确实有东西可送，才显示「确认送出」。 */
  sendable: boolean;
  tone: ClearBackpackTone;
  text: string;
}

/**
 * 浮层打开时先跑一次 dry-run，把「会送掉什么」摆出来。
 * 没东西可送、或者读取失败时，按钮只剩「关闭」。
 */
export function describeClearBackpackPreview(
  result: Pick<TaskRunResult, 'status' | 'summary'>,
): ClearBackpackPreview {
  const tone: ClearBackpackTone = result.status === 'success' ? 'success' : result.status;
  return {
    sendable: result.status === 'success',
    tone,
    text: result.summary,
  };
}

/** 把任务结果压成卡片上的一行提示。 */
export function clearBackpackOutcome(
  result: Pick<TaskRunResult, 'status' | 'summary' | 'metrics'>,
): ClearBackpackOutcome {
  const metrics = result.metrics;
  if (result.status === 'success') {
    return {
      tone: 'success',
      text: metrics ? `已送出 ${metrics.succeeded} 个礼物` : result.summary,
    };
  }
  if (result.status === 'partial') {
    return {
      tone: 'partial',
      text: metrics
        ? `送出 ${metrics.succeeded} 个，失败 ${metrics.failed} 个`
        : result.summary,
    };
  }
  return { tone: result.status, text: result.summary };
}
