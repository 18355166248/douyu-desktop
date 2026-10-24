import { describe, expect, it } from 'vitest';
import { computeDanmakuGeometry, danmakuGap } from './danmakuLayout';

describe('danmaku layout', () => {
  it('fills the whole layer and calculates tracks from font size', () => {
    const geometry = computeDanmakuGeometry({
      width: 640,
      height: 300,
      area: 'full',
      fontScale: 100,
      density: 6,
    });

    expect(geometry).toMatchObject({
      top: 0,
      usableHeight: 300,
      fontSize: 20,
      laneHeight: 38,
      laneCount: 7,
    });
  });

  it('restricts the quarter and bottom areas', () => {
    const quarter = computeDanmakuGeometry({
      width: 640,
      height: 300,
      area: 'quarter',
      fontScale: 100,
      density: 6,
    });
    expect(quarter.usableHeight).toBe(75);
    expect(quarter.laneCount).toBe(1);

    const bottom = computeDanmakuGeometry({
      width: 640,
      height: 300,
      area: 'bottom',
      fontScale: 100,
      density: 6,
    });
    expect(bottom.top).toBe(150);
    expect(bottom.usableHeight).toBe(150);
    expect(bottom.laneCount).toBe(3);
  });

  it('scales the font and tightens the gap with density', () => {
    const large = computeDanmakuGeometry({
      width: 640,
      height: 300,
      area: 'top',
      fontScale: 150,
      density: 10,
    });

    expect(large.fontSize).toBe(30);
    expect(large.laneHeight).toBe(57);
    expect(danmakuGap(1)).toBe(46);
    expect(danmakuGap(10)).toBe(20);
  });
});
