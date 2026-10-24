import md5 from 'blueimp-md5';
import { describe, expect, it } from 'vitest';
import { getDouyuAuth } from './douyuSign';

describe('getDouyuAuth', () => {
  it('hashes rand + key + room + timestamp when encTime is 0', () => {
    expect(getDouyuAuth('123', 1_700_000_000, 'key', 'rand', 0, 0)).toBe(
      md5('randkey1231700000000'),
    );
  });

  it('omits room and timestamp for special rooms', () => {
    expect(getDouyuAuth('123', 1_700_000_000, 'key', 'rand', 0, 1)).toBe(md5('randkey'));
  });

  it('applies encTime rounds before the final hash', () => {
    const firstRound = md5('randkey');
    expect(getDouyuAuth('123', 1_700_000_000, 'key', 'rand', 1, 0)).toBe(
      md5(`${firstRound}key1231700000000`),
    );
  });
});
