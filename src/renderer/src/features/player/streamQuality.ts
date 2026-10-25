import type {
  BilibiliQuality,
  DouyuQuality,
  HuyaQuality,
  StreamPlatform,
  StreamQuality,
} from '@shared/contracts/stream';

export const DOUYU_QUALITY_OPTIONS: ReadonlyArray<{ value: DouyuQuality; label: string }> = [
  { value: '0', label: '原画' },
  { value: '3', label: '高清' },
  { value: '4', label: '超清' },
  { value: '8', label: '蓝光' },
];

export const BILIBILI_QUALITY_OPTIONS: ReadonlyArray<{ value: BilibiliQuality; label: string }> = [
  { value: '10000', label: '原画' },
  { value: '400', label: '蓝光' },
  { value: '250', label: '超清' },
  { value: '150', label: '高清' },
  { value: '80', label: '流畅' },
];

export const HUYA_QUALITY_OPTIONS: ReadonlyArray<{ value: HuyaQuality; label: string }> = [
  { value: '2000', label: '自动' },
];

export function qualityOptionsFor(
  platform: StreamPlatform,
): ReadonlyArray<{ value: StreamQuality; label: string }> {
  if (platform === 'bilibili') return BILIBILI_QUALITY_OPTIONS;
  if (platform === 'huya') return HUYA_QUALITY_OPTIONS;
  return DOUYU_QUALITY_OPTIONS;
}

export function defaultQuality(platform: StreamPlatform): StreamQuality {
  if (platform === 'bilibili') return '10000';
  if (platform === 'huya') return '2000';
  return '0';
}

const QUALITY_BY_LABEL: Readonly<Record<string, StreamQuality>> = {
  原画: '0',
  蓝光: '8',
  超清: '4',
  高清: '3',
  流畅: '3',
};

const BILIBILI_QUALITY_BY_LABEL: Readonly<Record<string, StreamQuality>> = {
  原画: '10000',
  蓝光: '400',
  超清: '250',
  高清: '150',
  流畅: '80',
};

/** Align the select with the quality the CDN actually returned. */
export function qualityFromLabel(
  platform: StreamPlatform,
  label: string,
): StreamQuality | undefined {
  if (platform === 'bilibili') return BILIBILI_QUALITY_BY_LABEL[label];
  if (platform === 'huya') return '2000';
  return QUALITY_BY_LABEL[label];
}
