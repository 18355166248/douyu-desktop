import type { Rectangle } from 'electron';

export interface DisplayArea {
  id: number;
  workArea: Rectangle;
}

/**
 * Picks the screen for a newly opened app window. Prefers a screen with fewer
 * app windows, and breaks ties by avoiding the screen that opened the window.
 * Single-screen setups keep the normal default window size/position.
 */
export function chooseNewWindowBounds(
  displays: readonly DisplayArea[],
  occupiedDisplayIds: readonly number[],
  sourceDisplayId: number | undefined,
): Rectangle | undefined {
  if (displays.length < 2) return undefined;

  const counts = new Map<number, number>();
  for (const display of displays) counts.set(display.id, 0);
  for (const id of occupiedDisplayIds) {
    if (counts.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const least = Math.min(...displays.map((display) => counts.get(display.id) ?? 0));
  const candidates = displays.filter((display) => (counts.get(display.id) ?? 0) === least);
  const target = candidates.find((display) => display.id !== sourceDisplayId) ?? candidates[0];

  return target ? { ...target.workArea } : undefined;
}
