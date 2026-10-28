import { describe, expect, it } from 'vitest';
import { resumeLivePlayback } from './resumeLivePlayback';

function videoAt(currentTime: number, ranges: number[][]) {
  return {
    currentTime,
    buffered: {
      length: ranges.length,
      start: (i: number) => ranges[i]![0]!,
      end: (i: number) => ranges[i]![1]!,
    },
  } as HTMLVideoElement;
}
describe('resume near buffered live edge', () => {
  it('skips a long pause and uses the newest continuous buffered range', () => {
    const video = videoAt(15, [
      [10, 20],
      [40, 50],
    ]);
    resumeLivePlayback(video);
    expect(video.currentTime).toBe(48);
  });
  it.each([{ ranges: [] }, { ranges: [[10, 11]] }])(
    'does not seek into missing or insufficient buffer $ranges',
    ({ ranges }) => {
      const video = videoAt(0, ranges as number[][]);
      resumeLivePlayback(video);
      expect(video.currentTime).toBe(0);
    },
  );
  it('does not disturb playback already near the edge or seek backwards', () => {
    for (const time of [48, 51]) {
      const video = videoAt(time, [[40, 50]]);
      resumeLivePlayback(video);
      expect(video.currentTime).toBe(time);
    }
  });
});
