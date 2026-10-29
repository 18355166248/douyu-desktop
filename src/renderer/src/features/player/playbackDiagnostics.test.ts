import { describe, expect, it } from 'vitest';
import { bufferedAhead } from './playbackDiagnostics';

describe('playable buffer measurement', () => {
  const buffered = {
    length: 2,
    start: (index: number) => [0, 20][index]!,
    end: (index: number) => [10, 30][index]!,
  };
  it.each([
    [5, 5],
    [15, 0],
    [25, 5],
    [30, 0],
    [35, 0],
  ])(
    'at %s seconds reports %s seconds without counting future disconnected ranges',
    (currentTime, expected) => {
      expect(bufferedAhead({ buffered, currentTime })).toBe(expected);
    },
  );
  it('handles a video without buffered data', () => {
    expect(bufferedAhead({ buffered: { ...buffered, length: 0 }, currentTime: 0 })).toBe(0);
  });
});
