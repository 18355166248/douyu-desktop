import { describe, expect, it } from 'vitest';
import { formatLiveElapsed, formatLiveElapsedLong, liveDurationDisplay } from './liveDuration';

describe('formatLiveElapsed', () => {
  it.each([
    [0, '0:00'],
    [9_000, '0:09'],
    [65_000, '1:05'],
    [59 * 60_000 + 59_000, '59:59'],
    [3_600_000, '1:00:00'],
    [8 * 3_600_000 + 36 * 60_000 + 12_000, '8:36:12'],
    [25 * 3_600_000, '1天1小时'],
  ])('formats %i ms as %s', (elapsedMs, expected) => {
    expect(formatLiveElapsed(elapsedMs)).toBe(expected);
  });

  it('clamps negative values instead of printing a minus sign', () => {
    expect(formatLiveElapsed(-5_000)).toBe('0:00');
  });
});

describe('formatLiveElapsedLong', () => {
  it.each([
    [12_000, '12秒'],
    [125_000, '2分5秒'],
    [3 * 3_600_000 + 4 * 60_000 + 5_000, '3小时4分5秒'],
    [30 * 3_600_000, '1天6小时'],
  ])('formats %i ms as %s', (elapsedMs, expected) => {
    expect(formatLiveElapsedLong(elapsedMs)).toBe(expected);
  });
});

describe('liveDurationDisplay', () => {
  const liveSince = Date.UTC(2026, 10, 2, 4, 58, 9);

  it('shows the badge with a Beijing-time tooltip', () => {
    const display = liveDurationDisplay(liveSince, liveSince + 8 * 3_600_000 + 36 * 60_000 + 12_000);
    expect(display).toEqual({
      display: '已播 8:36:12',
      title: '开播于 2026-11-02 12:58:09（已播 8小时36分12秒）',
    });
  });

  it('hides the badge without a start time', () => {
    expect(liveDurationDisplay(null, Date.now())).toBeNull();
  });

  it('hides the badge when the start time is in the future', () => {
    expect(liveDurationDisplay(liveSince, liveSince - 1_000)).toBeNull();
  });
});
