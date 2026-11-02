import { formatBeijingDateTime } from '@shared/time/beijingTime';

const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * Compact badge text. Under an hour it stays `mm:ss` so a fresh stream does not
 * show a useless `0:`; hours use `h:mm:ss`, and multi-day 24/7 channels switch
 * to `天/小时` so the badge cannot grow without bound.
 */
export function formatLiveElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}天${hours % 24}小时`;
  }
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${totalMinutes}:${pad(seconds)}`;
}

/** Spoken-form duration used in the tooltip, where precision beats brevity. */
export function formatLiveElapsedLong(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  if (hours >= 24) return `${Math.floor(hours / 24)}天${hours % 24}小时`;
  if (hours > 0) return `${hours}小时${minutes}分${seconds}秒`;
  if (totalMinutes > 0) return `${totalMinutes}分${seconds}秒`;
  return `${seconds}秒`;
}

export interface LiveDurationDisplay {
  display: string;
  title: string;
}

/**
 * Returns null whenever the elapsed value cannot be trusted: no start time, or a
 * start time in the future (a platform clock running ahead would otherwise show
 * a negative duration).
 */
export function liveDurationDisplay(
  liveSince: number | null,
  now: number,
): LiveDurationDisplay | null {
  if (liveSince === null || !Number.isFinite(liveSince)) return null;
  const elapsedMs = now - liveSince;
  if (elapsedMs < 0) return null;
  return {
    display: `已播 ${formatLiveElapsed(elapsedMs)}`,
    title: `开播于 ${formatBeijingDateTime(liveSince)}（已播 ${formatLiveElapsedLong(elapsedMs)}）`,
  };
}
