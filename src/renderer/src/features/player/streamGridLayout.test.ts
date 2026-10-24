import { describe, expect, it } from 'vitest';
import { canAddStream, getStreamLayout, MAX_STREAMS } from './streamGridLayout';

describe('streamGridLayout', () => {
  it('maps stream counts to layouts', () => {
    expect(getStreamLayout(0)).toBe('empty');
    expect(getStreamLayout(1)).toBe('single');
    expect(getStreamLayout(2)).toBe('duo');
    expect(getStreamLayout(3)).toBe('quad');
    expect(getStreamLayout(4)).toBe('quad');
  });

  it('stops accepting streams at the configured limit', () => {
    expect(canAddStream(0)).toBe(true);
    expect(canAddStream(MAX_STREAMS - 1)).toBe(true);
    expect(canAddStream(MAX_STREAMS)).toBe(false);
    expect(canAddStream(MAX_STREAMS + 1)).toBe(false);
  });
});
