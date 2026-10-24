import { describe, expect, it } from 'vitest';
import { hasStreamStalled, STALL_TIMEOUT_MS } from './streamStall';

describe('stream stall detection', () => {
  it('does not flag a stall before the timeout', () => {
    expect(hasStreamStalled(7_999, 0)).toBe(false);
  });

  it('flags a stall when the media clock stops for the full timeout', () => {
    expect(hasStreamStalled(STALL_TIMEOUT_MS, 0)).toBe(true);
  });

  it('clears the condition when progress is reported again', () => {
    const now = 20_000;
    expect(hasStreamStalled(now, now - STALL_TIMEOUT_MS + 1)).toBe(false);
    expect(hasStreamStalled(now, now - STALL_TIMEOUT_MS)).toBe(true);
  });
});
