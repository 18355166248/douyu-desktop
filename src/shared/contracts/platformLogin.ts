import type { StreamPlatform } from './stream';

export type GuidedPlatform = Exclude<StreamPlatform, 'douyu'>;

export interface PlatformLoginStatus {
  platform: GuidedPlatform;
  loggedIn: boolean;
  nickname: string;
  avatarUrl: string;
  message?: string;
}
