import type { StreamPlatform } from '@shared/contracts/stream';
import bilibiliIcon from '../assets/platforms/bilibili.png';
import douyuIcon from '../assets/platforms/douyu.png';
import huyaIcon from '../assets/platforms/huya.png';

export const PLATFORM_ICON_URLS: Record<StreamPlatform, string> = {
  douyu: douyuIcon,
  bilibili: bilibiliIcon,
  huya: huyaIcon,
};
