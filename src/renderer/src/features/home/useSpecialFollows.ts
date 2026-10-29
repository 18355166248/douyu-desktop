import { useCallback, useEffect, useRef, useState } from 'react';
import type { SpecialFollowEntry, SpecialFollowTarget } from '@shared/contracts/specialFollow';
import { errorMessage, unwrap } from '../../lib/api';
import { specialFollowKey } from './homeModel';

export interface UseSpecialFollowsResult {
  entries: SpecialFollowEntry[];
  error: string | null;
  busy: boolean;
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

  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const confirmed = useRef<SpecialFollowEntry[]>([]);
  const revision = useRef(0);
  const accept = useCallback((next: SpecialFollowEntry[]): void => {
    revision.current += 1;
    confirmed.current = next;
    setEntries(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const started = revision.current;
    void window.api.special
      .load()
      .then((result) => {
        if (cancelled || started !== revision.current) return;
        if (result.ok) accept(result.data);
        else setError(errorMessage(result.error));
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(errorMessage(reason));
      });
    const unsubscribe = window.api.special.onChange(accept);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [accept]);

  const reload = useCallback((): Promise<void> => {
    setError(null);
    const started = revision.current;
    return window.api.special
      .load()
      .then((result) => {
        if (started !== revision.current) return;
        if (result.ok) accept(result.data);
        else setError(errorMessage(result.error));
      })
      .catch((reason: unknown) => setError(errorMessage(reason)));
  }, [accept]);

  const toggle = useCallback(
    (target: SpecialFollowTarget): void => {
      // 收藏写入期间禁止重复切换；失败恢复最新已确认快照，保留其他窗口的变更。
      if (pending.current) return;
      pending.current = true;
      setBusy(true);
      revision.current += 1;
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
          accept(unwrap(result));
        })
        .catch((reason: unknown) => {
          setEntries(confirmed.current);
          setError(errorMessage(reason));
        })
        .finally(() => {
          pending.current = false;
          setBusy(false);
        });
    },
    [accept],
  );

  return { entries, error, busy, reload, toggle };
}
