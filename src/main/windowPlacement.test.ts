import { describe, expect, it } from 'vitest';
import { chooseNewWindowBounds } from './windowPlacement';

const primary = { id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1040 } };
const secondary = { id: 2, workArea: { x: 1920, y: 0, width: 2560, height: 1400 } };

describe('chooseNewWindowBounds', () => {
  it('returns undefined when there is no second screen', () => {
    expect(chooseNewWindowBounds([primary], [1], 1)).toBeUndefined();
    expect(chooseNewWindowBounds([], [], undefined)).toBeUndefined();
  });

  it('places the new window on the unused screen', () => {
    expect(chooseNewWindowBounds([primary, secondary], [1], 1)).toEqual(secondary.workArea);
  });

  it('balances windows and avoids the source screen on ties', () => {
    expect(chooseNewWindowBounds([primary, secondary], [1, 2], 2)).toEqual(primary.workArea);
    expect(chooseNewWindowBounds([primary, secondary], [1, 1], 1)).toEqual(secondary.workArea);
  });

  it('returns a copy so callers cannot mutate display data', () => {
    const bounds = chooseNewWindowBounds([primary, secondary], [1], 1);
    expect(bounds).not.toBe(secondary.workArea);
    expect(bounds).toEqual(secondary.workArea);
  });
});
