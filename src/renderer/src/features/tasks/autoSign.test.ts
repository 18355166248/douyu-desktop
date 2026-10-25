import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  completedSignAccount,
  hasAutoSignRunToday,
  loadAutoSignEnabled,
  localDayKey,
  markAutoSignRun,
  saveAutoSignEnabled,
} from './autoSign';
import type { TaskRunResult } from '@shared/contracts/task';

const values = new Map<string, string>();
const storage = {
  getItem: (key: string): string | null => values.get(key) ?? null,
  setItem: (key: string, value: string): void => {
    values.set(key, value);
  },
} as unknown as Storage;

beforeEach(() => {
  values.clear();
  vi.stubGlobal('window', { localStorage: storage });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('auto sign settings', () => {
  it('records the executing account, never the account switched to afterwards', () => {
    const result: TaskRunResult = {
      runId: 'run-a',
      taskId: 'douyu.fans-sign',
      accountId: 'a',
      dryRun: false,
      status: 'success',
      summary: '完成',
      startedAt: 0,
      finishedAt: new Date(2026, 9, 25, 12).getTime(),
    };
    const owner = completedSignAccount(result, '2026-10-25');
    expect(owner).toBe('a');
    if (owner) markAutoSignRun(owner, '2026-10-25');
    expect(hasAutoSignRunToday('a', '2026-10-25')).toBe(true);
    expect(hasAutoSignRunToday('b', '2026-10-25')).toBe(false);
    expect(completedSignAccount({ ...result, dryRun: true }, '2026-10-25')).toBeNull();
    expect(completedSignAccount({ ...result, status: 'failed' }, '2026-10-25')).toBeNull();
    expect(completedSignAccount(result, '2026-10-26')).toBeNull();
    const unattributed = { ...result };
    delete unattributed.accountId;
    expect(completedSignAccount(unattributed, '2026-10-25')).toBeNull();
  });
  it('defaults to enabled and persists a disabled setting', () => {
    expect(loadAutoSignEnabled()).toBe(true);
    saveAutoSignEnabled(false);
    expect(loadAutoSignEnabled()).toBe(false);
  });

  it('tracks one run per account per local day', () => {
    markAutoSignRun('account-1', '2026-10-25');
    expect(hasAutoSignRunToday('account-1', '2026-10-25')).toBe(true);
    expect(hasAutoSignRunToday('account-1', '2026-10-26')).toBe(false);
    expect(hasAutoSignRunToday('account-2', '2026-10-25')).toBe(false);
  });

  it('formats the local day key with zero padding', () => {
    expect(localDayKey(new Date(2026, 0, 2, 23, 59))).toBe('2026-01-02');
  });
});
