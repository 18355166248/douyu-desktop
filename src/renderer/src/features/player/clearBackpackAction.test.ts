import { describe, expect, it } from 'vitest';
import {
  buildClearBackpackInput,
  CLEAR_BACKPACK_TASK_ID,
  clearBackpackOutcome,
  describeClearBackpackPreview,
} from './clearBackpackAction';

describe('buildClearBackpackInput', () => {
  it('targets the current room and always carries the confirmation flag', () => {
    expect(buildClearBackpackInput('9999')).toEqual({
      taskId: CLEAR_BACKPACK_TASK_ID,
      options: { roomId: '9999' },
      confirmed: true,
      dryRun: false,
    });
  });

  it('keeps the confirmation flag when previewing', () => {
    expect(buildClearBackpackInput('9999', true)).toMatchObject({
      confirmed: true,
      dryRun: true,
    });
  });
});

describe('describeClearBackpackPreview', () => {
  it('offers the confirm button when the backpack has gifts', () => {
    expect(
      describeClearBackpackPreview({
        status: 'success',
        summary: '将送出 7 个背包礼物（价值 ¥1.75）',
      }),
    ).toEqual({
      sendable: true,
      tone: 'success',
      text: '将送出 7 个背包礼物（价值 ¥1.75）',
    });
  });

  it('hides the confirm button when there is nothing to send', () => {
    expect(
      describeClearBackpackPreview({ status: 'skipped', summary: '背包里没有可送出的礼物' }),
    ).toEqual({ sendable: false, tone: 'skipped', text: '背包里没有可送出的礼物' });
  });

  it('never offers confirmation when the preview itself failed', () => {
    expect(
      describeClearBackpackPreview({ status: 'failed', summary: '登录已过期，请重新登录斗鱼' }),
    ).toEqual({ sendable: false, tone: 'failed', text: '登录已过期，请重新登录斗鱼' });
  });
});

describe('clearBackpackOutcome', () => {
  it('keeps the platform failure reason visible after a partial send', () => {
    expect(
      clearBackpackOutcome({
        status: 'partial',
        summary: '部分礼物没能送出',
        metrics: { total: 100, succeeded: 20, failed: 80 },
        details: { failures: [{ message: '礼物数量不足' }] },
      }),
    ).toEqual({ tone: 'partial', text: '送出 20 个，失败 80 个，原因：礼物数量不足' });
  });

  it('reports how many gifts were sent', () => {
    expect(
      clearBackpackOutcome({
        status: 'success',
        summary: '已送出 7 个背包礼物',
        metrics: { total: 7, succeeded: 7, failed: 0 },
      }),
    ).toEqual({ tone: 'success', text: '已送出 7 个礼物' });
  });

  it('splits the numbers on a partial run', () => {
    expect(
      clearBackpackOutcome({
        status: 'partial',
        summary: '部分礼物没能送出',
        metrics: { total: 7, succeeded: 2, failed: 5 },
      }),
    ).toEqual({ tone: 'partial', text: '送出 2 个，失败 5 个' });
  });

  it('passes the summary through when there is nothing to count', () => {
    expect(clearBackpackOutcome({ status: 'skipped', summary: '背包里没有可送出的礼物' })).toEqual({
      tone: 'skipped',
      text: '背包里没有可送出的礼物',
    });

    expect(clearBackpackOutcome({ status: 'failed', summary: '房间不存在' })).toEqual({
      tone: 'failed',
      text: '房间不存在',
    });
  });
});
