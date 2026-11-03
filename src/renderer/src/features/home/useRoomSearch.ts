import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoomSearchItem } from '@shared/contracts/search';
import { errorMessage } from '../../lib/api';

/** 输入停顿多久后才真正请求上游，避免逐字触发搜索。 */
const SEARCH_DEBOUNCE_MS = 300;

export interface UseRoomSearchResult {
  items: RoomSearchItem[];
  /** 当前 items 对应的关键词；空字符串表示还没有任何结果落定。 */
  settledQuery: string;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

/**
 * 按关键词搜索斗鱼主播/直播间。启用时才请求；输入框清空或页面切走时清空结果，
 * 关键词变化后旧响应会被丢弃，不会覆盖新关键词的结果。
 */
export function useRoomSearch(query: string, enabled: boolean): UseRoomSearchResult {
  const trimmed = query.trim();
  const active = enabled && trimmed.length > 0;
  const [state, setState] = useState<{ items: RoomSearchItem[]; query: string }>({
    items: [],
    query: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    if (!active) {
      requestId.current += 1;
      setState({ items: [], query: '' });
      setLoading(false);
      setError(null);
      return undefined;
    }

    const current = ++requestId.current;
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      void window.api.search
        .rooms({ query: trimmed })
        .then((result) => {
          if (requestId.current !== current) return;
          if (!result.ok) {
            setState({ items: [], query: trimmed });
            setError(errorMessage(result.error));
            return;
          }
          setState({ items: result.data.items, query: trimmed });
        })
        .catch((reason: unknown) => {
          if (requestId.current !== current) return;
          setState({ items: [], query: trimmed });
          setError(errorMessage(reason));
        })
        .finally(() => {
          if (requestId.current === current) setLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      // 关键词已变化：让仍在路上的响应失效。
      requestId.current += 1;
      window.clearTimeout(timer);
    };
  }, [active, trimmed, attempt]);

  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  return { items: state.items, settledQuery: state.query, loading, error, retry };
}
