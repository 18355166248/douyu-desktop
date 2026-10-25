import { useEffect, useRef, useState } from 'react';
import type { AccountSummary } from '@shared/contracts/account';
import {
  completedSignAccount,
  hasAutoSignRunToday,
  localDayKey,
  markAutoSignRun,
} from './autoSign';
import { useTasks } from './useTasks';

const ROOM_SIGN_TASK_ID = 'douyu.room-sign';

interface AutoSignRunnerProps {
  account: AccountSummary | undefined;
}

export function AutoSignRunner({ account }: AutoSignRunnerProps): null {
  const { autoSignEnabled, statusReady, running, runTask, tasks, result } = useTasks();
  const attempted = useRef(new Set<string>());
  const [, setDayTick] = useState(0);
  const day = localDayKey();
  const completedAccountId = completedSignAccount(result, day);

  useEffect(() => {
    const now = new Date();
    const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const timer = window.setTimeout(
      () => setDayTick((tick) => tick + 1),
      Math.max(1_000, nextDay.getTime() - now.getTime()),
    );
    return () => window.clearTimeout(timer);
  }, [day]);

  useEffect(() => {
    if (completedAccountId) markAutoSignRun(completedAccountId, day);
  }, [completedAccountId, day]);

  useEffect(() => {
    if (!autoSignEnabled || !statusReady || !account || account.status !== 'active') return;
    if (running || runTask.isPending || completedAccountId === account.id) return;

    const task = tasks.find((item) => item.id === ROOM_SIGN_TASK_ID);
    if (!task) return;

    const key = `${account.id}:${day}`;
    if (attempted.current.has(key) || hasAutoSignRunToday(account.id, day)) return;

    attempted.current.add(key);
    runTask.mutate({
      taskId: task.id,
      options: { liveOnly: true },
      dryRun: false,
    });
  }, [account, autoSignEnabled, day, completedAccountId, runTask, running, statusReady, tasks]);

  return null;
}
