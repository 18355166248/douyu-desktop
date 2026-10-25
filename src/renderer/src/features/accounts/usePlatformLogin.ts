import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GuidedPlatform, PlatformLoginStatus } from '@shared/contracts/platformLogin';
import { unwrap } from '../../lib/api';

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
  const queryClient = useQueryClient();
  const key = platformLoginKey(platform);
  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: key });
  };

  const query = usePlatformLoginStatus(platform);

  const login = useMutation({
    mutationFn: async () => unwrap(await window.api.platforms.login(platform)),
    onSuccess: (status) => {
      queryClient.setQueryData<PlatformLoginStatus>(key, status);
      refresh();
    },
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
    },
  });

  return { query, login, logout };
}
