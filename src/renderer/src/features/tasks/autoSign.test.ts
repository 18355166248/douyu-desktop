import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  hasAutoSignRunToday,
  loadAutoSignEnabled,
  localDayKey,
  markAutoSignRun,
  saveAutoSignEnabled,
} from './autoSign';

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
