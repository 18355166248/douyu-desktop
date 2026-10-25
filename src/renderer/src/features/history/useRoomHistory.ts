import { useCallback, useEffect, useState } from 'react';
import { unwrap } from '../../lib/api';
import {
  clearLegacyRoomHistory,
  loadLegacyRoomHistory,
  mergeRoomHistory,
  removeRoomHistory,
  upsertRoomHistory,
} from './roomHistory';
import type { RoomHistoryEntry, RoomVisit } from './roomHistory';

export interface UseRoomHistoryResult {
  entries: RoomHistoryEntry[];
  recordVisit: (visit: RoomVisit) => void;
  removeHistory: (keys: readonly string[]) => void;
  clearHistory: () => void;
}

export function useRoomHistory(): UseRoomHistoryResult {
  // Show the legacy localStorage copy immediately, then merge it into the global file.
  const [entries, setEntries] = useState<RoomHistoryEntry[]>(() => loadLegacyRoomHistory());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function hydrate(): Promise<void> {
      const local = loadLegacyRoomHistory();
      let global: RoomHistoryEntry[] = [];
      try {
        global = unwrap(await window.api.history.load());
        const merged = mergeRoomHistory(local, global);
        const saved = unwrap(await window.api.history.save(merged));
        if (cancelled) return;
        setEntries((current) => mergeRoomHistory(saved, current));
        // Only drop the local copy after the global write succeeded.
        clearLegacyRoomHistory();
      } catch (error) {
        if (cancelled) return;
        console.warn('[history] 全局历史加载失败，暂用本地副本', error);
        setEntries((current) => mergeRoomHistory(local, global, current));
      } finally {
        if (!cancelled) setHydrated(true);
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return undefined;
    let active = true;
    void window.api.history.save(entries).then((result) => {
      if (!active || result.ok) return;
      console.warn('[history] 全局历史保存失败', result.error.message);
    });
    return () => {
      active = false;
    };
  }, [entries, hydrated]);

  const recordVisit = useCallback((visit: RoomVisit): void => {
    setEntries((current) => upsertRoomHistory(current, visit));
  }, []);

  const removeHistory = useCallback((keys: readonly string[]): void => {
    setEntries((current) => removeRoomHistory(current, keys));
  }, []);

  const clearHistory = useCallback((): void => {
    setEntries([]);
  }, []);

  return { entries, recordVisit, removeHistory, clearHistory };
}
