export const MAX_STREAMS = 4;

export type StreamLayout = 'empty' | 'single' | 'duo' | 'quad';

export function getStreamLayout(count: number): StreamLayout {
  if (count <= 0) return 'empty';
  if (count === 1) return 'single';
  if (count === 2) return 'duo';
  return 'quad';
}

export function canAddStream(count: number): boolean {
  return count < MAX_STREAMS;
}
