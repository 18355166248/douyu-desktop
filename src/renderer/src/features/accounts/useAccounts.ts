import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { errorMessage, unwrap } from '../../lib/api';
import { useToast } from '../../lib/toast';

export const accountsKey = ['accounts'] as const;

export function useAccounts() {
  const notify = useToast();
  const queryClient = useQueryClient();
  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: accountsKey });
  };
  const reportError = (error: Error): void => notify(errorMessage(error), 'error');

  const query = useQuery({
    queryKey: accountsKey,
    queryFn: async () => unwrap(await window.api.accounts.list()),
  });

  const login = useMutation({
    mutationFn: async () => unwrap(await window.api.accounts.login()),
    onSuccess: (account) => {
      refresh();
      notify(`斗鱼登录成功：${account.nickname}`, 'success');
    },
    onError: reportError,
  });

  const switchAccount = useMutation({
    mutationFn: async (accountId: string) => {
      unwrap(await window.api.accounts.switch(accountId));
    },
    onSuccess: () => {
      refresh();
      notify('已切换斗鱼账号', 'success');
    },
    onError: reportError,
  });

  const logout = useMutation({
    mutationFn: async (accountId: string) => {
      unwrap(await window.api.accounts.logout(accountId));
    },
    onSuccess: () => {
      refresh();
      notify('已退出斗鱼账号', 'success');
    },
    onError: reportError,
  });

  const health = useMutation({
    mutationFn: async (accountId: string) => unwrap(await window.api.accounts.health(accountId)),
    onSuccess: (result) => {
      refresh();
      if (result.status === 'active') notify('斗鱼账号状态正常', 'success');
      else notify('斗鱼账号登录已过期', 'warning');
    },
    onError: reportError,
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
