import { describe, expect, it } from 'vitest';
import { formatBeijingDateTime, parseBeijingDateTime } from './beijingTime';

describe('parseBeijingDateTime', () => {
  it('parses the platform stamp as UTC+8 instead of the machine zone', () => {
    // 2026-11-02 12:58:09 Beijing time is 04:58:09 UTC.
    expect(parseBeijingDateTime('2026-11-02 12:58:09')).toBe(Date.UTC(2026, 10, 2, 4, 58, 9));
  });

  it('accepts an ISO-like separator and surrounding spaces', () => {
    expect(parseBeijingDateTime('  2026-01-01T00:00:00 ')).toBe(Date.UTC(2025, 11, 31, 16, 0, 0));
  });

  it('round-trips through the formatter', () => {
    const epoch = parseBeijingDateTime('2026-11-02 21:48:39');
    expect(epoch).not.toBeNull();
    expect(formatBeijingDateTime(epoch ?? 0)).toBe('2026-11-02 21:48:39');
  });

  it.each([
    null,
    undefined,
    '',
    '0000-00-00 00:00:00',
    '2026-11-02',
    '2026-13-01 00:00:00',
    '2026-00-01 00:00:00',
    '2026-02-31 00:00:00',
    '2026-11-02 24:00:00',
    '2026-11-02 12:60:00',
    '1999-01-01 00:00:00',
    'not a date',
  ])('rejects the unusable stamp %s', (value) => {
    expect(parseBeijingDateTime(value)).toBeNull();
  });
});
