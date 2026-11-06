import { vi } from 'vitest';

/** Media event/frame host; no simulated frame is delivered until the test asks for it. */
export class PlaybackTestVideo extends EventTarget {
  paused = true;
  seeking = false;
  muted = true;
  volume = 1;
  currentTime = 1;
  readyState = 3;
  videoWidth = 1920;
  style = { opacity: '' };
  removed = false;
  buffered = { length: 1, start: () => 0, end: () => 20 };
  private frame: (() => void) | undefined;
  play = vi.fn(async () => {
    this.paused = false;
  });
  pause = vi.fn(() => {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  });
  remove = vi.fn(() => {
    this.removed = true;
  });
  requestVideoFrameCallback = vi.fn((callback: () => void) => {
    this.frame = callback;
    return 1;
  });
  cancelVideoFrameCallback = vi.fn(() => {
    this.frame = undefined;
  });
  presentFrame(): void {
    const callback = this.frame;
    this.frame = undefined;
    callback?.();
  }
  asVideo(): HTMLVideoElement {
    return this as unknown as HTMLVideoElement;
  }
}
