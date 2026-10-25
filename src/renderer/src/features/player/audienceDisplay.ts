import type { RoomAudienceMetric } from '@shared/contracts/audience';

const exactNumber = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 20 });
const compactNumber = new Intl.NumberFormat('zh-CN', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function formatAudienceValue(
  value: number | null,
  isLowerBound = false,
): { display: string; exact: string } {
  if (value === null || !Number.isFinite(value) || value < 0) {
    return { display: '—', exact: '暂未获取' };
  }
  return {
    display: `${value >= 10_000 ? compactNumber.format(value) : exactNumber.format(value)}${isLowerBound ? '+' : ''}`,
    exact: `${isLowerBound ? '至少 ' : ''}${exactNumber.format(value)}`,
  };
}

export function audienceMetricTooltip(metric: RoomAudienceMetric): string {
  const { display, exact } = formatAudienceValue(metric.value, metric.isLowerBound);
  const value = display === '—' ? exact : `${exact} ${metric.unit}`;
  return `${metric.label}：${value}${metric.description ? `。${metric.description}` : ''}`;
}
