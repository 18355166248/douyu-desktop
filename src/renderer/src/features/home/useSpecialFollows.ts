import { useCallback, useEffect, useState } from 'react';
import type { SpecialFollowEntry, SpecialFollowTarget } from '@shared/contracts/specialFollow';
import { errorMessage } from '../../lib/api';
import { specialFollowKey } from './homeModel';

export interface UseSpecialFollowsResult {
  entries: SpecialFollowEntry[];
  error: string | null;
  reload: () => Promise<void>;
  toggle: (target: SpecialFollowTarget) => void;
}

function optimisticEntry(target: SpecialFollowTarget): SpecialFollowEntry {
  const name = target.name?.trim() || `房间 ${target.roomId}`;
  return {
    platform: target.platform,
    roomId: target.roomId,
    name,
    title: target.title?.trim() || name,
    addedAt: Date.now(),
  };
}

export function useSpecialFollows(): UseSpecialFollowsResult {
  const [entries, setEntries] = useState<SpecialFollowEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.api.special
      .load()
      .then((result) => {
        if (!cancelled && result.ok) setEntries(result.data);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(errorMessage(reason));
      });
    const unsubscribe = window.api.special.onChange((next) => setEntries(next));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const reload = useCallback((): Promise<void> => {
    setError(null);
    return window.api.special
      .load()
      .then((result) => {
        if (result.ok) setEntries(result.data);
        else setError(errorMessage(result.error));
      })
      .catch((reason: unknown) => setError(errorMessage(reason)));
  }, []);

  const toggle = useCallback((target: SpecialFollowTarget): void => {
    setError(null);
    const key = specialFollowKey(target);
    setEntries((current) => {
      const exists = current.some((item) => specialFollowKey(item) === key);
      return exists
        ? current.filter((item) => specialFollowKey(item) !== key)
        : [optimisticEntry(target), ...current];
    });

    void window.api.special
      .toggle(target)
      .then((result) => {
        if (result.ok) setEntries(result.data);
        else setError(errorMessage(result.error));
      })
      .catch((reason: unknown) => setError(errorMessage(reason)));
  }, []);

  return { entries, error, reload, toggle };
}
