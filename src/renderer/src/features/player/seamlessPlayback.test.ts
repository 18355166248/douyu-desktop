import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StreamPlayback } from '@shared/contracts/stream';
import { attachPlayback } from './playbackSession';
import { SeamlessPlayback } from './seamlessPlayback';
import { PlaybackTestVideo } from './playbackTestVideo';

vi.mock('./playbackSession', () => ({ attachPlayback: vi.fn() }));
const source: StreamPlayback = {
  platform: 'douyu',
  roomId: '1',
  title: '',
  anchorName: '',
  quality: '高清',
  url: 'https://example.test/live.flv',
  format: 'flv',
};
let videos: PlaybackTestVideo[];
let controllers: SeamlessPlayback[];
let paused: boolean;
const callbacks = () => ({
  isUserPaused: () => paused,
  onVideo: vi.fn(),
  onReady: vi.fn(),
  onPlaying: vi.fn(),
  onWaiting: vi.fn(),
  onPreparing: vi.fn(),
  onRecovering: vi.fn(),
  onError: vi.fn(),
  onReplacementError: vi.fn(),
  onPlayRejected: vi.fn(),
  onSource: vi.fn(),
});
function create() {
  const options = callbacks();
  const controller = new SeamlessPlayback(
    { appendChild: vi.fn() } as unknown as HTMLElement,
    options,
  );
  controllers.push(controller);
  controller.setAudio(false, 0.6);
  controller.setSource(source);
  const video = videos.at(-1)!;
  video.paused = false;
  video.dispatchEvent(new Event('canplay'));
  video.dispatchEvent(new Event('playing'));
  return { controller, options, video };
}
function attachment(video: PlaybackTestVideo) {
  const index = vi
    .mocked(attachPlayback)
    .mock.calls.findIndex(([target]) => target === video.asVideo());
  return {
    options: vi.mocked(attachPlayback).mock.calls[index]![2],
    dispose: vi.mocked(attachPlayback).mock.results[index]!.value,
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  videos = [];
  controllers = [];
  paused = false;
  vi.stubGlobal('document', {
    createElement: () => {
      const video = new PlaybackTestVideo();
      videos.push(video);
      return video;
    },
  });
  vi.mocked(attachPlayback)
    .mockReset()
    .mockImplementation(() => vi.fn());
});
afterEach(() => {
  controllers.forEach((controller) => controller.destroy());
  expect(vi.getTimerCount()).toBe(0);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('seamless media handoff', () => {
  it('retains old playback when autoplay is rejected after a candidate frame arrives', () => {
    const { controller, options, video } = create();
    controller.setSource({ ...source });
    const candidate = videos[1]!;
    candidate.presentFrame();
    attachment(candidate).options.onPlayRejected?.();
    expect(options.onVideo).toHaveBeenLastCalledWith(video);
    expect(attachment(video).dispose).not.toHaveBeenCalled();
    expect(options.onReplacementError).toHaveBeenCalledOnce();
    expect(candidate.removed).toBe(true);
  });

  it('waits for playback in the loadeddata fallback as well', () => {
    const { controller, options, video } = create();
    controller.setSource({ ...source });
    const candidate = videos[1]!;
    Object.defineProperty(candidate, 'requestVideoFrameCallback', { value: undefined });
    candidate.dispatchEvent(new Event('loadeddata'));
    expect(options.onVideo).toHaveBeenLastCalledWith(video);
    candidate.paused = false;
    candidate.dispatchEvent(new Event('playing'));
    expect(options.onVideo).toHaveBeenLastCalledWith(candidate);
  });
  it('keeps old playback if a decoded candidate has not started playing', () => {
    const { controller, options, video } = create();
    controller.setSource({ ...source, url: 'new' });
    const candidate = videos[1]!;
    candidate.presentFrame();
    expect(options.onVideo).toHaveBeenLastCalledWith(video);
    expect(attachment(video).dispose).not.toHaveBeenCalled();
    candidate.paused = false;
    candidate.dispatchEvent(new Event('playing'));
    expect(options.onVideo).toHaveBeenLastCalledWith(candidate);
  });

  it('reports the visible source, keeping it unchanged when replacement fails', () => {
    const { controller, options } = create();
    expect(options.onSource).toHaveBeenLastCalledWith(source);
    const replacement = { ...source, quality: '原画', url: 'new' };
    controller.setSource(replacement);
    expect(options.onSource).toHaveBeenCalledTimes(1);
    attachment(videos[1]!).options.onError('offline');
    expect(options.onSource).toHaveBeenCalledTimes(1);
    controller.setSource(replacement);
    videos[2]!.paused = false;
    videos[2]!.presentFrame();
    expect(options.onSource).toHaveBeenLastCalledWith(replacement);
  });
  it('keeps old playback until a decoded frame and transfers audio only at handoff', () => {
    const { controller, video, options } = create();
    controller.setSource({ ...source });
    const candidate = videos[1]!;
    candidate.paused = false;
    candidate.dispatchEvent(new Event('canplay'));
    candidate.dispatchEvent(new Event('playing'));
    expect(attachment(video).dispose).not.toHaveBeenCalled();
    expect(video.muted).toBe(false);
    expect(candidate.muted).toBe(true);
    expect(candidate.style.opacity).toBe('0');
    controller.setAudio(false, 0.3);
    candidate.presentFrame();
    expect(options.onVideo).toHaveBeenLastCalledWith(candidate);
    expect(candidate.style.opacity).toBe('1');
    expect(candidate.volume).toBe(0.3);
    expect(candidate.muted).toBe(false);
    expect(video.muted).toBe(true);
    expect(attachment(video).dispose).toHaveBeenCalledOnce();
    expect(video.removed).toBe(true);
  });

  it.each(['error', 'timeout', 'blocked'] as const)(
    'retains the old picture after candidate %s',
    (reason) => {
      const { controller, video, options } = create();
      controller.setSource({ ...source });
      const candidate = videos[1]!;
      if (reason === 'error') attachment(candidate).options.onError('offline');
      if (reason === 'blocked') attachment(candidate).options.onPlayRejected?.();
      if (reason === 'timeout') vi.advanceTimersByTime(20_000);
      candidate.presentFrame();
      expect(options.onVideo).toHaveBeenLastCalledWith(video);
      expect(options.onReplacementError).toHaveBeenCalledOnce();
      expect(attachment(video).dispose).not.toHaveBeenCalled();
      expect(attachment(candidate).dispose).toHaveBeenCalledOnce();
      expect(candidate.removed).toBe(true);
    },
  );

  it('discards superseded candidates and late frames/errors', () => {
    const { controller, options } = create();
    controller.setSource({ ...source, url: 'old' });
    const old = videos[1]!;
    const lateFrame = old.requestVideoFrameCallback.mock.calls[0]![0];
    controller.setSource({ ...source, url: 'new' });
    const latest = videos[2]!;
    lateFrame();
    attachment(old).options.onError('late');
    latest.paused = false;
    latest.presentFrame();
    expect(options.onVideo).toHaveBeenLastCalledWith(latest);
    expect(options.onReplacementError).not.toHaveBeenCalled();
    expect(attachment(old).dispose).toHaveBeenCalledOnce();
  });

  it('preserves a user pause during preparation and after promotion', () => {
    const { controller } = create();
    controller.setSource({ ...source });
    const candidate = videos[1]!;
    paused = true;
    expect(attachment(candidate).options.isUserPaused()).toBe(false);
    candidate.paused = false;
    candidate.presentFrame();
    expect(candidate.paused).toBe(true);
    expect(attachment(candidate).options.isUserPaused()).toBe(true);
    candidate.dispatchEvent(new Event('playing'));
    expect(candidate.paused).toBe(true);
  });

  it('rebuilds FLV/HLS on a second element and bounds unsuccessful recovery', () => {
    const { video, options } = create();
    for (let attempt = 1; attempt <= 3; attempt++) {
      attachment(video).options.onRecoveryRequired?.('broken');
      attachment(video).options.onRecoveryRequired?.('duplicate');
      vi.advanceTimersByTime(400 * attempt);
      attachment(videos.at(-1)!).options.onRecoveryRequired?.('candidate failed');
    }
    vi.advanceTimersByTime(60_000);
    expect(videos).toHaveLength(4);
    expect(options.onRecovering).toHaveBeenCalledTimes(3);
    expect(options.onError).toHaveBeenCalledOnce();
    expect(attachment(video).dispose).not.toHaveBeenCalled();
  });

  it('replenishes recovery budget only after sustained active playback', () => {
    const { controller, video, options } = create();
    attachment(video).options.onRecoveryRequired?.('broken');
    vi.advanceTimersByTime(400);
    const next = videos[1]!;
    next.paused = false;
    next.presentFrame();
    next.currentTime = 10;
    next.dispatchEvent(new Event('timeupdate'));
    next.currentTime = 20;
    next.dispatchEvent(new Event('timeupdate'));
    attachment(next).options.onRecoveryRequired?.('again');
    vi.advanceTimersByTime(400);
    expect(videos).toHaveLength(3);
    expect(options.onRecovering).toHaveBeenCalledTimes(2);
    controller.destroy();
  });

  it('limits simultaneous preparations across rooms and cancels queued rooms on close', () => {
    const rooms = [create(), create(), create(), create()];
    rooms.forEach(({ controller }) => controller.setSource({ ...source }));
    expect(videos).toHaveLength(6);
    rooms[2]!.controller.destroy();
    videos[4]!.paused = false;
    videos[4]!.presentFrame();
    expect(videos).toHaveLength(7);
    expect(rooms[2]!.options.onVideo).toHaveBeenLastCalledWith(null);
    rooms[3]!.controller.destroy();
    expect(videos[6]!.removed).toBe(true);
  });

  it('switches room identity without carrying the previous room picture', () => {
    const { controller, video, options } = create();
    controller.setSource({ ...source, roomId: '2' });
    expect(attachment(video).dispose).toHaveBeenCalledOnce();
    expect(options.onVideo).toHaveBeenLastCalledWith(videos[1]);
    expect(videos[1]!.style.opacity).toBe('1');
  });
});
