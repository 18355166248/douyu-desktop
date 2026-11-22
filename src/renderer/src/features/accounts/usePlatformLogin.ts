import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GuidedPlatform, PlatformLoginStatus } from '@shared/contracts/platformLogin';
import { errorMessage, unwrap } from '../../lib/api';
import { platformLabel } from '../../lib/streamIdentity';
import { useToast } from '../../lib/toast';

export const platformLoginKey = (platform: GuidedPlatform) =>
  ['platform-login', platform] as const;

export function usePlatformLoginStatus(platform: GuidedPlatform, enabled = true) {
  return useQuery({
    queryKey: platformLoginKey(platform),
    queryFn: async () => unwrap(await window.api.platforms.status(platform)),
    enabled,
  });
}

export function usePlatformLogin(platform: GuidedPlatform) {
  const notify = useToast();
  const label = platformLabel(platform);
  const queryClient = useQueryClient();
  const key = platformLoginKey(platform);
  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: key });
  };

  const query = usePlatformLoginStatus(platform);
  const reportError = (error: Error): void => notify(errorMessage(error), 'error');

  const login = useMutation({
    mutationFn: async () => unwrap(await window.api.platforms.login(platform)),
    onSuccess: (status) => {
      queryClient.setQueryData<PlatformLoginStatus>(key, status);
      refresh();
      if (status.loggedIn) notify(`${label}登录成功`, 'success');
    },
    onError: reportError,
  });

  const logout = useMutation({
    mutationFn: async () => {
      unwrap(await window.api.platforms.logout(platform));
    },
    onSuccess: () => {
      queryClient.setQueryData<PlatformLoginStatus>(key, {
        platform,
        loggedIn: false,
        nickname: '',
        avatarUrl: '',
      });
      refresh();
      notify(`已退出${label}`, 'success');
    },
    onError: reportError,
  });

  return { query, login, logout };
}
