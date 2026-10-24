import type { DouyuQuality } from '@shared/contracts/stream';

export const QUALITY_OPTIONS: ReadonlyArray<{ value: DouyuQuality; label: string }> = [
  { value: '0', label: '原画' },
  { value: '3', label: '高清' },
  { value: '4', label: '超清' },
  { value: '8', label: '蓝光' },
];
