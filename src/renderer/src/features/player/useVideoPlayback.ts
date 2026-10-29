import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { StreamPlayback } from '@shared/contracts/stream';
import { attachPlayback } from './playbackSession';
import { resumeLivePlayback } from './resumeLivePlayback';

interface PlaybackState {
  isReady: boolean;
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
  isReady: false,
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
) {
  const userPausedRef = useRef(false);
  const roomRef = useRef<string | null>(null);
  const sessionRef = useRef(0);
  const [state, setState] = useState<PlaybackState>(initialState);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    sessionRef.current += 1;
    const room = `${playback.platform}:${playback.roomId}`;
    const sameRoom = roomRef.current === room;
    roomRef.current = room;
    if (!sameRoom) userPausedRef.current = false;
    setState((previous) => ({
      ...(sameRoom ? previous : initialState),
      isReady: false,
      isPlaying: false,
      recovering: false,
      playBlocked: false,
      error: null,
      userPaused: userPausedRef.current,
      reparses: sameRoom ? previous.reparses + 1 : 0,
    }));

    const ready = (): void => setState((previous) => ({ ...previous, isReady: true }));
    const playing = (): void => {
      // 浏览器或底层播放器的自动播放也必须遵守用户暂停。
      if (userPausedRef.current) {
        video.pause();
        return;
      }
      setState((previous) => ({
        ...previous,
        isReady: true,
        isPlaying: true,
        recovering: false,
        playBlocked: false,
      }));
    };
    const waiting = (): void => setState((previous) => ({ ...previous, isPlaying: false }));
    const events = {
      loadedmetadata: ready,
      canplay: ready,
      playing,
      waiting,
      seeking: waiting,
      pause: waiting,
      ended: waiting,
    };
    for (const [name, listener] of Object.entries(events)) video.addEventListener(name, listener);
    const dispose = attachPlayback(video, playback, {
      isUserPaused: () => userPausedRef.current,
      onError: (error) =>
        setState((previous) => ({
          ...previous,
          error,
          lastError: error,
          recovering: false,
          isPlaying: false,
        })),
      onRecovering: (message) =>
        setState((previous) => ({
          ...previous,
          isPlaying: false,
          recovering: true,
          playBlocked: false,
          reconnects: previous.reconnects + 1,
          lastError: message,
        })),
      onPlayRejected: () =>
        setState((previous) => ({ ...previous, playBlocked: true, isPlaying: false })),
    });
    return () => {
      sessionRef.current += 1;
      for (const [name, listener] of Object.entries(events))
        video.removeEventListener(name, listener);
      dispose();
    };
  }, [playback, videoRef]);

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
    void video.play().catch(() => {
      if (sessionRef.current === session && videoRef.current === video && !userPausedRef.current) {
        setState((previous) => ({ ...previous, playBlocked: true, isPlaying: false }));
      }
    });
  }, [state.playBlocked, videoRef]);

  return { ...state, userPausedRef, togglePlayback };
}
