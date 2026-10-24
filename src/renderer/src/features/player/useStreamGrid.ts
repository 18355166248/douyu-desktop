import { useRef, useState } from 'react';
import type { DouyuQuality, StreamPlayback } from '@shared/contracts/stream';
import { errorMessage, unwrap } from '../../lib/api';
import { canAddStream, MAX_STREAMS } from './streamGridLayout';

export interface StreamGridEntry {
  playback: StreamPlayback;
  error: string | null;
}

export interface StreamResolveOptions {
  quality: DouyuQuality;
  preferHls: boolean;
}

export interface AddStreamOptions extends StreamResolveOptions {
  roomId: string;
}

export interface UseStreamGridResult {
  streams: StreamGridEntry[];
  isAdding: boolean;
  reloadingRoomId: string | null;
  audioRoomId: string | null;
  volumes: Record<string, number>;
  addStream: (options: AddStreamOptions) => Promise<string | null>;
  reloadStream: (roomId: string, options: StreamResolveOptions) => Promise<string | null>;
  removeStream: (roomId: string) => void;
  clearStreams: () => void;
  toggleAudio: (roomId: string) => void;
  setVolume: (roomId: string, volume: number) => void;
}

export const DEFAULT_VOLUME = 1;

export function useStreamGrid(): UseStreamGridResult {
  const [streams, setStreams] = useState<StreamGridEntry[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [reloadingRoomId, setReloadingRoomId] = useState<string | null>(null);
  const [audioRoomId, setAudioRoomId] = useState<string | null>(null);
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const addingRef = useRef(false);
  const reloadingRef = useRef<string | null>(null);

  async function addStream(options: AddStreamOptions): Promise<string | null> {
    const roomId = options.roomId.trim();
    if (!roomId) return '请输入斗鱼房间号';
    if (addingRef.current) return '正在解析其他房间，请稍候';
    if (streams.some((entry) => entry.playback.roomId === roomId)) {
      return `房间 ${roomId} 已在多屏中`;
    }
    if (!canAddStream(streams.length)) {
      return `最多同时播放 ${MAX_STREAMS} 路`;
    }

    addingRef.current = true;
    setIsAdding(true);
    try {
      const playback = unwrap(
        await window.api.streams.resolve({
          roomId,
          quality: options.quality,
          preferHls: options.preferHls,
        }),
      );
      setStreams((current) => [...current, { playback, error: null }]);
      setAudioRoomId(roomId);
      setVolumes((current) =>
        current[roomId] === undefined ? { ...current, [roomId]: DEFAULT_VOLUME } : current,
      );
      return null;
    } catch (error) {
      return errorMessage(error);
    } finally {
      addingRef.current = false;
      setIsAdding(false);
    }
  }

  async function reloadStream(
    roomId: string,
    options: StreamResolveOptions,
  ): Promise<string | null> {
    if (reloadingRef.current !== null) return '正在重新解析其他房间，请稍候';
    if (!streams.some((entry) => entry.playback.roomId === roomId)) return null;

    reloadingRef.current = roomId;
    setReloadingRoomId(roomId);
    try {
      const playback = unwrap(
        await window.api.streams.resolve({
          roomId,
          quality: options.quality,
          preferHls: options.preferHls,
        }),
      );
      setStreams((current) =>
        current.map((entry) =>
          entry.playback.roomId === roomId ? { playback, error: null } : entry,
        ),
      );
      return null;
    } catch (error) {
      const message = errorMessage(error);
      setStreams((current) =>
        current.map((entry) =>
          entry.playback.roomId === roomId ? { ...entry, error: message } : entry,
        ),
      );
      return null;
    } finally {
      reloadingRef.current = null;
      setReloadingRoomId(null);
    }
  }

  function removeStream(roomId: string): void {
    const remaining = streams.filter((entry) => entry.playback.roomId !== roomId);
    setStreams(remaining);
    setAudioRoomId((current) =>
      current === roomId ? (remaining[0]?.playback.roomId ?? null) : current,
    );
    setVolumes((current) => {
      const next = { ...current };
      delete next[roomId];
      return next;
    });
    if (reloadingRef.current === roomId) {
      reloadingRef.current = null;
      setReloadingRoomId(null);
    }
  }

  function clearStreams(): void {
    setStreams([]);
    setAudioRoomId(null);
    setVolumes({});
    reloadingRef.current = null;
    setReloadingRoomId(null);
  }

  function toggleAudio(roomId: string): void {
    setAudioRoomId((current) => (current === roomId ? null : roomId));
  }

  function setVolume(roomId: string, volume: number): void {
    const nextVolume = Math.min(1, Math.max(0, volume));
    setVolumes((current) => ({ ...current, [roomId]: nextVolume }));
    setAudioRoomId((current) => {
      if (nextVolume > 0) return roomId;
      return current === roomId ? null : current;
    });
  }

  return {
    streams,
    isAdding,
    reloadingRoomId,
    audioRoomId,
    volumes,
    addStream,
    reloadStream,
    removeStream,
    clearStreams,
    toggleAudio,
    setVolume,
  };
}
