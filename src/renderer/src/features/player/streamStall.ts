export const STALL_TIMEOUT_MS = 8_000;

/**
 * A live stream is considered stalled when its media clock has not advanced
 * for the whole timeout while the element is playing in a visible window.
 */
export function hasStreamStalled(
  now: number,
  lastProgressAt: number,
  timeout = STALL_TIMEOUT_MS,
): boolean {
  return now - lastProgressAt >= timeout;
}
