import { useCallback, useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import type { AutoClaimSettings, AutoClaimState } from '@shared/contracts/autoClaim';
import { errorMessage, unwrap } from '../../lib/api';
import { useToast } from '../../lib/toast';

interface UseAutoClaimResult {
  state: AutoClaimState | null;
  setSettings: UseMutationResult<AutoClaimState, Error, AutoClaimSettings>;
  poll: UseMutationResult<AutoClaimState, Error, void>;
}

/**
 * Mirrors the background auto-claim service. The main process owns the polling
 * loop; the renderer only flips switches and renders the event feed.
 */
export function useAutoClaim(): UseAutoClaimResult {
  const notify = useToast();
  const [state, setState] = useState<AutoClaimState | null>(null);

  useEffect(() => {
    let disposed = false;
    void window.api.claims
      .state()
      .then((response) => {
        if (!disposed) setState(unwrap(response));
      })
      .catch(() => undefined);

    const off = window.api.claims.onChange((next) => {
      if (!disposed) setState(next);
    });
    return () => {
      disposed = true;
      off();
    };
  }, []);

  const adopt = useCallback((next: AutoClaimState): void => {
    setState(next);
  }, []);
  const reportError = (reason: Error): void => notify(errorMessage(reason), 'error');

  const setSettings = useMutation({
    mutationFn: async (settings: AutoClaimSettings) =>
      unwrap(await window.api.claims.setSettings(settings)),
    onSuccess: adopt,
    onError: reportError,
  });

  const poll = useMutation({
    mutationFn: async () => unwrap(await window.api.claims.poll()),
    onSuccess: adopt,
    onError: reportError,
  });

  return { state, setSettings, poll };
}
