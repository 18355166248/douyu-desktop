import { describe, expect, it } from 'vitest';
import { anchoredPanelPosition } from './anchoredPanelPosition';

describe('anchoredPanelPosition', () => {
  it('opens upward from the bottom room of a compact window', () => {
    expect(
      anchoredPanelPosition(
        { left: 560, right: 588, top: 314, bottom: 342 },
        { width: 258, height: 170 },
        { width: 680, height: 420 },
      ),
    ).toEqual({ left: 330, top: 136, maxHeight: 298 });
  });

  it('keeps a panel away from the left window edge', () => {
    const position = anchoredPanelPosition(
      { left: 20, right: 48, top: 50, bottom: 78 },
      { width: 258, height: 170 },
      { width: 420, height: 420 },
    );
    expect(position).toEqual({ left: 8, top: 86, maxHeight: 326 });
  });

  it('constrains a tall result to available space so its content can scroll', () => {
    const position = anchoredPanelPosition(
      { left: 300, right: 328, top: 170, bottom: 198 },
      { width: 258, height: 500 },
      { width: 420, height: 280 },
    );
    expect(position).toEqual({ left: 70, top: 8, maxHeight: 154 });
  });
});
