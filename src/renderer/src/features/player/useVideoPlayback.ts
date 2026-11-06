import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { StreamPlayback } from '@shared/contracts/stream';
import { SeamlessPlayback } from './seamlessPlayback';
import { resumeLivePlayback } from './resumeLivePlayback';

interface PlaybackState {
  activePlayback: StreamPlayback | null;
  isReady: boolean;
  preparing: boolean;
  replacementError: string | null;
  videoRevision: number;
  isPlaying: boolean;
  userPaused: boolean;
  recovering: boolean;
  playBlocked: boolean;
  error: string | null;
  lastError: string | null;
  reconnects: number;
  reparses: number;
}

const initialState: PlaybackState = {
  activePlayback: null,
  isReady: false,
  preparing: false,
  replacementError: null,
  videoRevision: 0,
  isPlaying: false,
  userPaused: false,
  recovering: false,
  playBlocked: false,
  error: null,
  lastError: null,
  reconnects: 0,
  reparses: 0,
};

export function useVideoPlayback(
  videoRef: RefObject<HTMLVideoElement | null>,
  playback: StreamPlayback,
  containerRef: RefObject<HTMLDivElement | null>,
  muted: boolean,
  volume: number,
) {
  const userPausedRef = useRef(false);
  const roomRef = useRef<string | null>(null);
  const sessionRef = useRef(0);
  const [state, setState] = useState<PlaybackState>(initialState);

  const controllerRef = useRef<SeamlessPlayback | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const controller = new SeamlessPlayback(container, {
      isUserPaused: () => userPausedRef.current,
      onSource: (activePlayback) => setState((previous) => ({ ...previous, activePlayback })),
      onVideo: (video) => {
        sessionRef.current += 1;
        videoRef.current = video;
        if (video)
          setState((previous) => ({
            ...previous,
            preparing: false,
            recovering: false,
            error: null,
            replacementError: null,
            playBlocked: false,
            videoRevision: previous.videoRevision + 1,
          }));
      },
      onReady: () => setState((previous) => ({ ...previous, isReady: true })),
      onPlaying: () =>
        setState((previous) => ({
          ...previous,
          isReady: true,
          isPlaying: true,
          recovering: previous.preparing,
          playBlocked: false,
        })),
      onWaiting: () => setState((previous) => ({ ...previous, isPlaying: false })),
      onPreparing: () =>
        setState((previous) => ({
          ...previous,
          preparing: true,
          recovering: true,
          replacementError: null,
        })),
      onError: (error) =>
        setState((previous) => ({
          ...previous,
          error,
          lastError: error,
          preparing: false,
          recovering: false,
        })),
      onReplacementError: (message) =>
        setState((previous) => ({
          ...previous,
          replacementError: message,
          lastError: message,
          preparing: false,
          recovering: false,
        })),
      onRecovering: (message) =>
        setState((previous) => ({
          ...previous,
          preparing: true,
          recovering: true,
          reconnects: previous.reconnects + 1,
          lastError: message,
        })),
      onPlayRejected: () =>
        setState((previous) => ({ ...previous, playBlocked: true, isPlaying: false })),
    });
    controllerRef.current = controller;
    return () => {
      controller.destroy();
      controllerRef.current = null;
      roomRef.current = null;
    };
  }, [containerRef, videoRef]);

  useEffect(() => {
    sessionRef.current += 1;
    const room = `${playback.platform}:${playback.roomId}`;
    const sameRoom = roomRef.current === room;
    roomRef.current = room;
    if (!sameRoom) userPausedRef.current = false;
    setState((previous) => ({
      ...(sameRoom ? previous : initialState),
      error: null,
      replacementError: null,
      playBlocked: false,
      userPaused: userPausedRef.current,
      reparses: sameRoom ? previous.reparses + 1 : 0,
    }));
    controllerRef.current?.setSource(playback);
  }, [playback]);

  useEffect(() => {
    controllerRef.current?.setAudio(muted, volume);
  }, [muted, volume]);

  const togglePlayback = useCallback((): void => {
    const video = videoRef.current;
    if (!video) return;
    // 缓冲和重新连接时 video.paused 可能为 true，但点击“暂停”仍应暂停。
    if (!userPausedRef.current && !state.playBlocked) {
      userPausedRef.current = true;
      setState((previous) => ({ ...previous, userPaused: true, isPlaying: false }));
      video.pause();
      return;
    }
    userPausedRef.current = false;
    const session = sessionRef.current;
    setState((previous) => ({ ...previous, userPaused: false, playBlocked: false }));
    resumeLivePlayback(video);
    void video.play().catch((error: unknown) => {
      if (
        sessionRef.current === session &&
        videoRef.current === video &&
        !userPausedRef.current &&
        error instanceof Error &&
        error.name === 'NotAllowedError'
      ) {
        setState((previous) => ({ ...previous, playBlocked: true, isPlaying: false }));
      }
    });
  }, [state.playBlocked, videoRef]);

  const returnToLive = useCallback((): void => {
    const video = videoRef.current;
    if (video) resumeLivePlayback(video);
  }, [videoRef]);

  return { ...state, userPausedRef, togglePlayback, returnToLive };
}
