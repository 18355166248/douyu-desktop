export const MAX_STREAMS = 6;

export type StreamLayoutMode = 'even' | 'focus';

export type StreamLayout =
  | 'empty'
  | 'single'
  | 'duo'
  | 'quad'
  | 'six'
  | 'focus-2'
  | 'focus-3'
  | 'focus-4'
  | 'focus-5'
  | 'focus-6';

export const STREAM_LAYOUT_STORAGE_KEY = 'douyu-desktop.stream-layout.v1';

export function getStreamLayout(
  count: number,
  mode: StreamLayoutMode = 'even',
): StreamLayout {
  if (count <= 0) return 'empty';
  if (count === 1) return 'single';
  if (mode === 'focus') {
    if (count === 2) return 'focus-2';
    if (count === 3) return 'focus-3';
    if (count === 4) return 'focus-4';
    if (count === 5) return 'focus-5';
    return 'focus-6';
  }
  if (count === 2) return 'duo';
  if (count <= 4) return 'quad';
  return 'six';
}

export function loadStreamLayoutMode(): StreamLayoutMode {
  if (typeof window === 'undefined') return 'even';
  try {
    return window.localStorage.getItem(STREAM_LAYOUT_STORAGE_KEY) === 'focus'
      ? 'focus'
      : 'even';
  } catch {
    return 'even';
  }
}

export function saveStreamLayoutMode(mode: StreamLayoutMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STREAM_LAYOUT_STORAGE_KEY, mode);
  } catch {
    // localStorage may be unavailable; keep the current session preference.
  }
}

export function canAddStream(count: number): boolean {
  return count < MAX_STREAMS;
}
