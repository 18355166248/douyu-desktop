import { useCallback, useEffect, useRef, useState } from 'react';
import { unwrap } from '../../lib/api';
import { roomKey } from '../../lib/streamIdentity';
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
  const attemptedCoverKeys = useRef<Set<string>>(new Set());
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const reloadFromGlobal = useCallback((): void => {
    void window.api.history.load().then((result) => {
      if (result.ok) setEntries(result.data);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrate(): Promise<void> {
      const local = loadLegacyRoomHistory();
      let global: RoomHistoryEntry[] = [];
      try {
        global = unwrap(await window.api.history.load());
        const merged = local.length > 0 ? unwrap(await window.api.history.merge(local)) : global;
        if (cancelled) return;
        setEntries((current) => mergeRoomHistory(merged, current));
        // Only drop the local copy after the global write succeeded.
        clearLegacyRoomHistory();
      } catch (error) {
        if (cancelled) return;
        console.warn('[history] 全局历史加载失败，暂用本地副本', error);
        setEntries((current) => mergeRoomHistory(local, global, current));
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return window.api.history.onChange((next) => setEntries(next));
  }, []);

  // Older history entries only stored text. Resolve their covers once in the
  // background, then persist them so later launches render thumbnails instantly.
  useEffect(() => {
    const missing = entries
      .filter((entry) => {
        const key = roomKey(entry.platform, entry.roomId);
        return !entry.cover && !attemptedCoverKeys.current.has(key);
      })
      .slice(0, 12);

    if (missing.length === 0) return undefined;

    for (const entry of missing) {
      attemptedCoverKeys.current.add(roomKey(entry.platform, entry.roomId));
    }

    void Promise.all(
      missing.map(async (entry): Promise<RoomHistoryEntry | null> => {
        try {
          const result = await window.api.streams.resolve({
            platform: entry.platform,
            roomId: entry.roomId,
          });
          if (!result.ok || !result.data.cover) return null;
          return { ...entry, cover: result.data.cover };
        } catch {
          return null;
        }
      }),
    ).then((resolved) => {
      if (!isMounted.current) return;
      const withCovers = resolved.filter(
        (entry): entry is RoomHistoryEntry => entry !== null,
      );
      if (withCovers.length === 0) return;
      setEntries((current) => mergeRoomHistory(withCovers, current));
      void window.api.history.merge(withCovers).then((result) => {
        if (result.ok) return;
        console.warn('[history] 历史封面保存失败', result.error.message);
      });
    });

    return undefined;
  }, [entries]);

  const recordVisit = useCallback(
    (visit: RoomVisit): void => {
      const roomId = visit.roomId.trim();
      if (!roomId) return;

      const visitedAt = Date.now();
      const platform = visit.platform ?? 'douyu';
      setEntries((current) => upsertRoomHistory(current, visit, visitedAt));
      void window.api.history
        .merge([
          {
            platform,
            roomId,
            title: visit.title,
            anchorName: visit.anchorName,
            visitedAt,
            ...(visit.cover ? { cover: visit.cover } : {}),
          },
        ])
        .then((result) => {
          if (result.ok) return;
          console.warn('[history] 全局历史保存失败', result.error.message);
          reloadFromGlobal();
        });
    },
    [reloadFromGlobal],
  );

  const removeHistory = useCallback(
    (keys: readonly string[]): void => {
      if (keys.length === 0) return;
      setEntries((current) => removeRoomHistory(current, keys));
      void window.api.history.remove([...keys]).then((result) => {
        if (result.ok) return;
        console.warn('[history] 全局历史删除失败', result.error.message);
        reloadFromGlobal();
      });
    },
    [reloadFromGlobal],
  );

  const clearHistory = useCallback((): void => {
    setEntries([]);
    void window.api.history.clear().then((result) => {
      if (result.ok) return;
      console.warn('[history] 全局历史清空失败', result.error.message);
      reloadFromGlobal();
    });
  }, [reloadFromGlobal]);

  return { entries, recordVisit, removeHistory, clearHistory };
}
