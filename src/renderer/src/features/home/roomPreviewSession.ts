import type { ResolveStreamInput, StreamPlayback, StreamPlatform } from '@shared/contracts/stream';
import { unwrap } from '../../lib/api';
import { attachPlayback } from '../player/playbackSession';

export type PreviewStatus = 'waiting' | 'loading' | 'playing' | 'unavailable';
export const PREVIEW_DELAY_MS = 500;
export const PREVIEW_TIMEOUT_MS = 12_000;

// A keyboard-focused card and a hovered card must never play two previews together.
let stopCurrentPreview: (() => void) | undefined;

export function startRoomPreview(
  video: HTMLVideoElement,
  platform: StreamPlatform,
  roomId: string,
  onStatus: (status: PreviewStatus) => void,
): () => void {
  stopCurrentPreview?.();
  let disposed = false;
  let detach: (() => void) | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const stop = (): void => {
    if (disposed) return;
    disposed = true;
    clearTimeout(delay);
    clearTimeout(timeout);
    video.removeEventListener('playing', onPlaying);
    detach?.();
    video.pause();
    onStatus('waiting');
    if (stopCurrentPreview === stop) stopCurrentPreview = undefined;
  };
  const fail = (): void => {
    if (disposed) return;
    stop();
    onStatus('unavailable');
  };
  const onPlaying = (): void => {
    if (disposed) return;
    clearTimeout(timeout);
    onStatus('playing');
  };
  stopCurrentPreview = stop;
  video.muted = true;
  video.volume = 0;
  video.addEventListener('playing', onPlaying);
  onStatus('waiting');

  const delay = setTimeout(() => {
    if (disposed) return;
    onStatus('loading');
    timeout = setTimeout(fail, PREVIEW_TIMEOUT_MS);
    const input: ResolveStreamInput = {
      platform,
      roomId,
      quality: platform === 'bilibili' ? '80' : platform === 'huya' ? '2000' : '3',
      preferHls: true,
    };
    void (async () => {
      const playback: StreamPlayback = unwrap(await window.api.streams.resolve(input));
      // IPC resolution cannot be aborted; a late result must never start playback.
      if (disposed) return;
      detach = attachPlayback(video, playback, { isUserPaused: () => disposed, onError: fail });
    })().catch(fail);
  }, PREVIEW_DELAY_MS);

  return stop;
}
