import { useCallback, useEffect, useState } from 'react';
import {
  loadRoomHistory,
  removeRoomHistory,
  saveRoomHistory,
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
  const [entries, setEntries] = useState<RoomHistoryEntry[]>(() => loadRoomHistory());

  useEffect(() => {
    saveRoomHistory(entries);
  }, [entries]);

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
