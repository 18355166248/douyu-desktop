import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountSummary } from '@shared/contracts/account';
import type { TaskRunResult } from '@shared/contracts/task';
import { AutoSignRunner } from './AutoSignRunner';
import { hasAutoSignRunToday, localDayKey } from './autoSign';

const host = vi.hoisted(() => ({
  effects: [] as Array<() => unknown>,
  attempted: { current: new Set<string>() },
  state: {
    autoSignEnabled: true,
    statusReady: true,
    running: false,
    runTask: { isPending: false, mutate: vi.fn() },
    tasks: [{ id: 'douyu.room-sign' }],
    result: null as TaskRunResult | null,
  },
}));
vi.mock('react', () => ({
  useEffect: (effect: () => unknown) => {
    host.effects.push(effect);
  },
  useRef: () => host.attempted,
  useState: () => [0, vi.fn()],
}));
vi.mock('./useTasks', () => ({ useTasks: () => host.state }));

function render(accountId: string) {
  host.effects = [];
  AutoSignRunner({ account: { id: accountId, status: 'active' } as AccountSummary });
  for (const effect of host.effects) effect();
}

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal('window', {
    setTimeout: vi.fn(),
    clearTimeout: vi.fn(),
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
  host.attempted.current.clear();
  host.state.autoSignEnabled = true;
  host.state.runTask.mutate.mockClear();
  host.state.result = {
    runId: 'run-a',
    taskId: 'douyu.room-sign',
    accountId: 'a',
    dryRun: false,
    status: 'success',
    summary: '完成',
    startedAt: Date.now(),
    finishedAt: Date.now(),
  };
});
afterEach(() => vi.unstubAllGlobals());

describe('AutoSignRunner account isolation', () => {
  it('records the old account and still starts a run for the newly selected account', () => {
    render('b');
    expect(hasAutoSignRunToday('a', localDayKey())).toBe(true);
    expect(hasAutoSignRunToday('b', localDayKey())).toBe(false);
    expect(host.state.runTask.mutate).toHaveBeenCalledExactlyOnceWith({
      taskId: 'douyu.room-sign',
      options: { liveOnly: true },
      dryRun: false,
    });
    render('b');
    expect(host.state.runTask.mutate).toHaveBeenCalledTimes(1);
  });

  it('does not let a manual dry run block real automatic sign-in', () => {
    host.state.result = { ...host.state.result!, dryRun: true };
    host.state.autoSignEnabled = false;
    render('a');
    expect(hasAutoSignRunToday('a')).toBe(false);
    expect(host.state.runTask.mutate).not.toHaveBeenCalled();
    host.state.autoSignEnabled = true;
    render('a');
    expect(host.state.runTask.mutate).toHaveBeenCalledTimes(1);
  });
});
