import type { StreamPlayback } from '@shared/contracts/stream';
import { attachPlayback } from './playbackSession';

const PREPARE_TIMEOUT_MS = 20_000;
const MAX_RECOVERY_ATTEMPTS = 3;

// Bound the extra network/decoder load when multiple rooms recover together.
let preparing = 0;
const preparationQueue: Array<() => void> = [];
function reservePreparation(start: () => void): () => void {
  let running = false;
  let cancelled = false;
  const run = (): void => {
    if (cancelled) return;
    running = true;
    preparing += 1;
    start();
  };
  preparationQueue.push(run);
  if (preparing < 2) preparationQueue.shift()?.();
  return () => {
    if (cancelled) return;
    cancelled = true;
    const index = preparationQueue.indexOf(run);
    if (index >= 0) preparationQueue.splice(index, 1);
    if (running) preparing -= 1;
    if (preparing < 2) preparationQueue.shift()?.();
  };
}

interface Session {
  video: HTMLVideoElement;
  source: StreamPlayback;
  dispose: () => void;
  stopWaiting: () => void;
  ready: boolean;
}

interface Options {
  isUserPaused: () => boolean;
  onVideo: (video: HTMLVideoElement | null) => void;
  onSource: (source: StreamPlayback) => void;
  onReady: () => void;
  onPlaying: () => void;
  onWaiting: () => void;
  onPreparing: () => void;
  onRecovering: (message: string) => void;
  onError: (message: string) => void;
  onReplacementError: (message: string) => void;
  onPlayRejected: () => void;
}

/** Owns the visible video and at most one muted replacement, including its frame gate. */
export class SeamlessPlayback {
  private active: Session | null = null;
  private candidate: Session | null = null;
  private cancelPreparation: (() => void) | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private recoveryAttempts = 0;
  private healthySince: number | null = null;
  private generation = 0;
  private destroyed = false;
  private muted = true;
  private volume = 1;

  constructor(
    private readonly container: HTMLElement,
    private readonly options: Options,
  ) {}

  setAudio(muted: boolean, volume: number): void {
    this.muted = muted;
    this.volume = Math.min(1, Math.max(0, volume));
    if (this.active) {
      this.active.video.volume = this.volume;
      this.active.video.muted = muted;
    }
  }

  setSource(source: StreamPlayback): void {
    if (this.destroyed) return;
    this.cancelPending();
    this.recoveryAttempts = 0;
    const previous = this.active;
    if (
      previous &&
      (previous.source.platform !== source.platform || previous.source.roomId !== source.roomId)
    ) {
      this.active = null;
      previous.dispose();
    }
    if (!this.active) {
      this.active = this.createSession(source, false);
      this.options.onVideo(this.active.video);
      this.options.onSource(source);
      this.setAudio(this.muted, this.volume);
    } else {
      this.prepare(source, false);
    }
  }

  private cancelPending(): void {
    this.generation += 1;
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const candidate = this.candidate;
    this.candidate = null;
    candidate?.dispose();
    const release = this.cancelPreparation;
    this.cancelPreparation = null;
    release?.();
  }

  private prepare(source: StreamPlayback, recovery: boolean): void {
    const generation = this.generation;
    this.options.onPreparing();
    this.cancelPreparation = reservePreparation(() => {
      if (this.destroyed || generation !== this.generation) return;
      this.candidate = this.createSession(source, true, recovery);
    });
  }

  private recover(session: Session, message: string): void {
    if (
      this.destroyed ||
      this.active !== session ||
      this.cancelPreparation ||
      this.retryTimer !== null
    )
      return;
    if (!session.ready) {
      this.options.onError(message);
      return;
    }
    this.healthySince = null;
    if (this.recoveryAttempts >= MAX_RECOVERY_ATTEMPTS) {
      this.options.onError(message);
      return;
    }
    this.recoveryAttempts += 1;
    this.options.onRecovering(message);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.destroyed && this.active === session) this.prepare(session.source, true);
    }, 400 * this.recoveryAttempts);
  }

  private reject(session: Session, message: string, recovery: boolean): void {
    if (this.candidate !== session) return;
    this.cancelPending();
    this.options.onReplacementError(message);
    if (recovery && this.active) this.recover(this.active, message);
  }

  private promote(session: Session): void {
    if (this.destroyed || this.candidate !== session) return;
    const previous = this.active;
    session.stopWaiting();
    session.ready = true;
    // Change picture and audio ownership in the same task; never play two audio tracks.
    if (previous) previous.video.muted = true;
    if (this.options.isUserPaused()) session.video.pause();
    session.video.style.opacity = '1';
    this.active = session;
    this.candidate = null;
    this.healthySince = null;
    this.setAudio(this.muted, this.volume);
    this.options.onVideo(session.video);
    this.options.onSource(session.source);
    this.options.onReady();
    if (!session.video.paused) this.options.onPlaying();
    else this.options.onWaiting();
    previous?.dispose();
    const release = this.cancelPreparation;
    this.cancelPreparation = null;
    release?.();
  }

  private createSession(source: StreamPlayback, hidden: boolean, recovery = false): Session {
    const video = document.createElement('video');
    video.className = 'video';
    video.playsInline = true;
    video.preload = 'auto';
    video.muted = true;
    video.style.opacity = hidden ? '0' : '1';
    this.container.appendChild(video);
    let disposed = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let frame: number | undefined;
    let frameReady = false;
    const session: Session = {
      video,
      source,
      ready: false,
      dispose: () => {},
      stopWaiting: () => {
        clearTimeout(timeout);
        if (frame !== undefined) video.cancelVideoFrameCallback(frame);
        frame = undefined;
      },
    };
    const current = (): boolean => !disposed && this.active === session;
    const tryPromote = (): boolean => {
      if (
        !disposed &&
        this.candidate === session &&
        frameReady &&
        video.readyState >= 2 &&
        video.videoWidth > 0 &&
        !video.seeking &&
        !video.ended &&
        (!video.paused || this.options.isUserPaused())
      ) {
        this.promote(session);
        return true;
      }
      return false;
    };
    const ready = (): void => {
      if (tryPromote()) return;
      if (!current()) return;
      session.ready = true;
      this.options.onReady();
    };
    const playing = (): void => {
      if (tryPromote()) return;
      if (!current()) return;
      if (this.options.isUserPaused()) {
        video.pause();
        return;
      }
      ready();
      this.options.onPlaying();
    };
    const waiting = (): void => {
      if (current()) {
        this.healthySince = null;
        this.options.onWaiting();
      }
    };
    const progress = (): void => {
      if (!current() || video.paused || video.seeking) return;
      this.healthySince ??= video.currentTime;
      if (video.currentTime - this.healthySince >= 10) this.recoveryAttempts = 0;
    };
    const fallbackFrame = (): void => {
      if (
        typeof video.requestVideoFrameCallback !== 'function' &&
        video.readyState >= 2 &&
        video.videoWidth > 0
      ) {
        frameReady = true;
        tryPromote();
      }
    };
    const events = {
      canplay: ready,
      playing,
      waiting,
      seeking: waiting,
      pause: waiting,
      ended: waiting,
      timeupdate: progress,
      loadeddata: fallbackFrame,
    };
    for (const [event, handler] of Object.entries(events)) video.addEventListener(event, handler);
    if (hidden) {
      if (typeof video.requestVideoFrameCallback === 'function') {
        frame = video.requestVideoFrameCallback(() => {
          frame = undefined;
          frameReady = true;
          tryPromote();
        });
      }
      timeout = setTimeout(
        () => this.reject(session, '新直播流加载超时，已保留原画面', recovery),
        PREPARE_TIMEOUT_MS,
      );
    }
    const fail = (message: string): void => {
      if (disposed) return;
      if (this.candidate === session) this.reject(session, message, recovery);
      else this.recover(session, message);
    };
    const detach = attachPlayback(video, source, {
      // The hidden video decodes muted even while the visible player is paused.
      isUserPaused: () => this.active === session && this.options.isUserPaused(),
      onRecoveryRequired: fail,
      onError: fail,
      onPlayRejected: () => {
        if (this.candidate === session)
          this.reject(session, '新直播流无法自动播放，已保留原画面', recovery);
        else if (current()) this.options.onPlayRejected();
      },
    });
    session.dispose = () => {
      if (disposed) return;
      disposed = true;
      session.stopWaiting();
      for (const [event, handler] of Object.entries(events))
        video.removeEventListener(event, handler);
      detach();
      video.remove();
    };
    return session;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.cancelPending();
    this.active?.dispose();
    this.active = null;
    this.options.onVideo(null);
  }
}
