import { useEffect, useRef, useState } from 'react';
import type { AccountSummary } from '@shared/contracts/account';
import {
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
  const attempted = useRef<string | null>(null);
  const [, setDayTick] = useState(0);
  const day = localDayKey();
  const resultDay = result ? localDayKey(new Date(result.finishedAt)) : null;

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
    if (!account || account.status !== 'active') return;
    if (!result || result.taskId !== ROOM_SIGN_TASK_ID) return;
    if (resultDay !== day) return;
    if (result.status === 'failed') return;
    markAutoSignRun(account.id, day);
  }, [account, day, result, resultDay]);

  useEffect(() => {
    if (!autoSignEnabled || !statusReady || !account || account.status !== 'active') return;
    if (running || runTask.isPending || resultDay === day) return;

    const task = tasks.find((item) => item.id === ROOM_SIGN_TASK_ID);
    if (!task) return;

    const key = `${account.id}:${day}`;
    if (attempted.current === key || hasAutoSignRunToday(account.id, day)) return;

    attempted.current = key;
    runTask.mutate({
      taskId: task.id,
      options: { liveOnly: true },
      dryRun: false,
    });
  }, [account, autoSignEnabled, day, resultDay, runTask, running, statusReady, tasks]);

  return null;
}
