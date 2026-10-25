import type { TaskRunResult } from '@shared/contracts/task';

const STORAGE_KEY = 'douyu-desktop.auto-sign.v1';

export function completedSignAccount(result: TaskRunResult | null, day: string): string | null {
  if (
    !result ||
    result.taskId !== 'douyu.room-sign' ||
    result.dryRun !== false ||
    result.status === 'failed' ||
    localDayKey(new Date(result.finishedAt)) !== day
  )
    return null;
  return result.accountId ?? null;
}

interface AutoSignStore {
  enabled: boolean;
  lastRun: Record<string, string>;
}

function readStore(): AutoSignStore {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { enabled: true, lastRun: {} };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { enabled: true, lastRun: {} };
    }
    const record = parsed as Record<string, unknown>;
    const lastRun: Record<string, string> = {};
    const rawLastRun = record.lastRun;
    if (rawLastRun && typeof rawLastRun === 'object' && !Array.isArray(rawLastRun)) {
      for (const [accountId, day] of Object.entries(rawLastRun)) {
        if (typeof day === 'string') lastRun[accountId] = day;
      }
    }
    return {
      enabled: typeof record.enabled === 'boolean' ? record.enabled : true,
      lastRun,
    };
  } catch {
    return { enabled: true, lastRun: {} };
  }
}

function writeStore(store: AutoSignStore): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // localStorage may be unavailable; auto sign-in simply stays session-only.
  }
}

export function loadAutoSignEnabled(): boolean {
  return readStore().enabled;
}

export function saveAutoSignEnabled(enabled: boolean): void {
  const store = readStore();
  writeStore({ ...store, enabled });
}

export function localDayKey(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function hasAutoSignRunToday(accountId: string, day = localDayKey()): boolean {
  return readStore().lastRun[accountId] === day;
}

export function markAutoSignRun(accountId: string, day = localDayKey()): void {
  const store = readStore();
  writeStore({ ...store, lastRun: { ...store.lastRun, [accountId]: day } });
}
