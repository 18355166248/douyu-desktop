import { describe, expect, it } from 'vitest';
import {
  AUTO_RECOVERY_RESET_MS,
  canAutoRecover,
  clearAutoRecovered,
  hasStreamStalled,
  markAutoRecovered,
  STALL_TIMEOUT_MS,
} from './streamStall';

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

describe('automatic recovery cooldown', () => {
  it('allows one recovery per room and blocks repeats inside the window', () => {
    const room = 'douyu:cooldown-a';
    expect(canAutoRecover(room, 1_000)).toBe(true);
    markAutoRecovered(room, 1_000);
    expect(canAutoRecover(room, 2_000)).toBe(false);
    expect(canAutoRecover(room, 1_000 + AUTO_RECOVERY_RESET_MS - 1)).toBe(false);
    expect(canAutoRecover(room, 1_000 + AUTO_RECOVERY_RESET_MS)).toBe(true);
  });

  it('keeps rooms independent and re-arms after a manual reload', () => {
    const room = 'douyu:cooldown-b';
    markAutoRecovered(room, 5_000);
    expect(canAutoRecover('douyu:cooldown-c', 5_100)).toBe(true);
    clearAutoRecovered(room);
    expect(canAutoRecover(room, 5_100)).toBe(true);
  });
});
