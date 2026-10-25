import { useCallback, useEffect, useRef, useState } from 'react';
import type { FollowedRoom } from '@shared/contracts/follow';
import { errorMessage } from '../../lib/api';

export interface UseFollowedRoomsResult {
  rooms: FollowedRoom[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * Loads the active account's Douyu follows for the home page. The request is
 * repeated only when the selected account changes or the user asks to refresh.
 */
export function useFollowedRooms(
  accountId: string | null,
  accountIsActive: boolean,
): UseFollowedRoomsResult {
  const [rooms, setRooms] = useState<FollowedRoom[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const loadedAccount = useRef<string | null>(null);

  const reload = useCallback((): Promise<void> => {
    const currentRequest = ++requestId.current;
    if (!accountId || !accountIsActive) {
      loadedAccount.current = accountId;
      setRooms([]);
      setLoading(false);
      setError(null);
      return Promise.resolve();
    }

    setLoading(true);
    setError(null);
    return window.api.home
      .followed()
      .then((result) => {
        if (requestId.current !== currentRequest) return;
        if (result.ok) setRooms(result.data);
        else setError(errorMessage(result.error));
      })
      .catch((reason: unknown) => {
        if (requestId.current === currentRequest) setError(errorMessage(reason));
      })
      .finally(() => {
        if (requestId.current === currentRequest) setLoading(false);
      });
  }, [accountId, accountIsActive]);

  useEffect(() => {
    if (!accountId || !accountIsActive) {
      loadedAccount.current = null;
      setRooms([]);
      setError(null);
      setLoading(false);
      return;
    }
    if (loadedAccount.current === accountId) return;
    loadedAccount.current = accountId;
    void reload();
  }, [accountId, accountIsActive, reload]);

  return { rooms, loading, error, reload };
}
