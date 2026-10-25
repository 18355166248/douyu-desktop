import { describe, expect, it } from 'vitest';
import { audienceMetricTooltip, formatAudienceValue } from './audienceDisplay';

describe('audience display', () => {
  it('distinguishes missing values from real zeroes', () => {
    expect(formatAudienceValue(null)).toEqual({ display: '—', exact: '暂未获取' });
    expect(formatAudienceValue(0)).toEqual({ display: '0', exact: '0' });
    expect(formatAudienceValue(Number.NaN).display).toBe('—');
    expect(formatAudienceValue(-1).display).toBe('—');
  });

  it('keeps exact counts available when displayed with 万 or 亿', () => {
    expect(formatAudienceValue(9876)).toEqual({ display: '9,876', exact: '9,876' });
    expect(formatAudienceValue(12345)).toEqual({ display: '1.2万', exact: '12,345' });
    expect(formatAudienceValue(123456789)).toEqual({
      display: '1.2亿',
      exact: '123,456,789',
    });
  });

  it('preserves the platform cap instead of presenting a lower bound as an exact count', () => {
    expect(formatAudienceValue(9999, true)).toEqual({ display: '9,999+', exact: '至少 9,999' });
    expect(
      audienceMetricTooltip({
        key: 'highEnergy',
        label: '高能用户',
        value: 9999,
        unit: '人',
        isLowerBound: true,
      }),
    ).toBe('高能用户：至少 9,999 人');
    expect(formatAudienceValue(null, true).display).toBe('—');
  });

  it('preserves metric units and source explanations in the tooltip', () => {
    expect(
      audienceMetricTooltip({
        key: 'daily',
        label: '日活跃',
        value: 12345,
        unit: '分',
        description: '平台活跃积分，不代表在线人数',
      }),
    ).toBe('日活跃：12,345 分。平台活跃积分，不代表在线人数');
    expect(audienceMetricTooltip({ key: 'vip', label: '贵宾', value: null, unit: '人' })).toBe(
      '贵宾：暂未获取',
    );
  });
});
