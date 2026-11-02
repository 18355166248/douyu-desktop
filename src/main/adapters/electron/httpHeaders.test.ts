import { describe, expect, it } from 'vitest';
import { extractReferrer } from './httpHeaders';

describe('extractReferrer', () => {
  it('moves the Referer header out of the header bag', () => {
    expect(
      extractReferrer({ Referer: 'https://www.douyu.com/138243', 'User-Agent': 'ua' }),
    ).toEqual({
      headers: { 'User-Agent': 'ua' },
      referrer: 'https://www.douyu.com/138243',
    });
  });

  it('matches the header name case-insensitively', () => {
    expect(extractReferrer({ referer: 'https://www.huya.com/660000' })).toEqual({
      headers: {},
      referrer: 'https://www.huya.com/660000',
    });
  });

  it('leaves requests without a referer untouched', () => {
    expect(extractReferrer({ 'User-Agent': 'ua' })).toEqual({
      headers: { 'User-Agent': 'ua' },
      referrer: undefined,
    });
    expect(extractReferrer(undefined)).toEqual({ headers: {}, referrer: undefined });
  });
});
