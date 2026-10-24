import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { unwrap } from '../../lib/api';

export const accountsKey = ['accounts'] as const;

export function useAccounts() {
  const queryClient = useQueryClient();
  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: accountsKey });
  };

  const query = useQuery({
    queryKey: accountsKey,
    queryFn: async () => unwrap(await window.api.accounts.list()),
  });

  const login = useMutation({
    mutationFn: async () => unwrap(await window.api.accounts.login()),
    onSuccess: refresh,
  });

  const switchAccount = useMutation({
    mutationFn: async (accountId: string) => {
      unwrap(await window.api.accounts.switch(accountId));
    },
    onSuccess: refresh,
  });

  const logout = useMutation({
    mutationFn: async (accountId: string) => {
      unwrap(await window.api.accounts.logout(accountId));
    },
    onSuccess: refresh,
  });

  const health = useMutation({
    mutationFn: async (accountId: string) => unwrap(await window.api.accounts.health(accountId)),
    onSuccess: refresh,
  });

  const accounts = query.data ?? [];
  const activeAccount = accounts.find((account) => account.isActive);

  return {
    query,
    accounts,
    activeAccount,
    login,
    switchAccount,
    logout,
    health,
  };
}
