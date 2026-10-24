import type { DanmakuArea } from './danmakuSettings';

const BASE_FONT_SIZE = 20;
const MIN_LANE_HEIGHT = 32;
const LANE_HEIGHT_FACTOR = 1.9;
const GAP_MIN = 20;
const GAP_MAX = 46;

export interface DanmakuGeometry {
  width: number;
  height: number;
  top: number;
  usableHeight: number;
  fontSize: number;
  laneHeight: number;
  laneCount: number;
  gap: number;
}

interface GeometryInput {
  width: number;
  height: number;
  area: DanmakuArea;
  fontScale: number;
  density: number;
}

function areaHeight(height: number, area: DanmakuArea): number {
  switch (area) {
    case 'quarter':
      return height * 0.25;
    case 'top':
    case 'bottom':
      return height * 0.5;
    case 'full':
      return height;
    default:
      return height;
  }
}

export function danmakuGap(density: number): number {
  const ratio = (Math.min(10, Math.max(1, density)) - 1) / 9;
  return GAP_MAX - ratio * (GAP_MAX - GAP_MIN);
}

export function remapLane(lane: number, fromCount: number, toCount: number): number {
  const from = Math.max(1, fromCount);
  const to = Math.max(1, toCount);
  if (to === 1) return 0;
  const ratio = from > 1 ? lane / (from - 1) : 0;
  return Math.round(Math.min(1, Math.max(0, ratio)) * (to - 1));
}

export function computeDanmakuGeometry({
  width,
  height,
  area,
  fontScale,
  density,
}: GeometryInput): DanmakuGeometry {
  const safeWidth = Math.max(0, width);
  const safeHeight = Math.max(0, height);
  const fontSize = Math.max(12, Math.round(BASE_FONT_SIZE * (fontScale / 100)));
  const laneHeight = Math.max(MIN_LANE_HEIGHT, Math.ceil(fontSize * LANE_HEIGHT_FACTOR));
  const usableHeight = Math.max(0, areaHeight(safeHeight, area));
  const top = area === 'bottom' ? safeHeight - usableHeight : 0;
  const laneCount = Math.max(1, Math.floor(usableHeight / laneHeight));

  return {
    width: safeWidth,
    height: safeHeight,
    top,
    usableHeight,
    fontSize,
    laneHeight,
    laneCount,
    gap: danmakuGap(density),
  };
}
