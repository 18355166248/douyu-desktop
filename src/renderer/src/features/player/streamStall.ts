export const STALL_TIMEOUT_MS = 8_000;

/**
 * Once playback has been healthy for this long, allow another automatic
 * reload. This prevents a broken stream from reloading in a tight loop while
 * still recovering from a later freeze.
 */
export const AUTO_RECOVERY_RESET_MS = 60_000;

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

/**
 * The guard used to live on the component instance, so remounting a tile (key
 * change, view switch, new video element) reset it and the same room could
 * reload itself two or three times in a row. Remember the timestamp for the
 * whole renderer process instead, keyed by room.
 */
const lastAutoRecoveryAt = new Map<string, number>();

/** True when this room may recover itself again without hammering the resolver. */
export function canAutoRecover(roomKey: string, now: number): boolean {
  const last = lastAutoRecoveryAt.get(roomKey);
  return last === undefined || now - last >= AUTO_RECOVERY_RESET_MS;
}

export function markAutoRecovered(roomKey: string, now: number): void {
  lastAutoRecoveryAt.set(roomKey, now);
}

/** A manual reload re-arms the automatic recovery for that room. */
export function clearAutoRecovered(roomKey: string): void {
  lastAutoRecoveryAt.delete(roomKey);
}
