import { useRef, useState } from 'react';
import type { DouyuQuality, StreamPlayback } from '@shared/contracts/stream';
import { errorMessage, unwrap } from '../../lib/api';
import { canAddStream, MAX_STREAMS } from './streamGridLayout';

export interface StreamGridEntry {
  playback: StreamPlayback;
  error: string | null;
  options: StreamResolveOptions;
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
  mutedRooms: Record<string, boolean>;
  volumes: Record<string, number>;
  addStream: (
    options: AddStreamOptions,
    onResolved?: (playback: StreamPlayback) => void,
  ) => Promise<string | null>;
  reloadStream: (roomId: string, options?: StreamResolveOptions) => Promise<string | null>;
  setStreamOptions: (
    roomId: string,
    patch: Partial<StreamResolveOptions>,
  ) => Promise<string | null>;
  removeStream: (roomId: string) => void;
  clearStreams: () => void;
  toggleMute: (roomId: string) => void;
  setVolume: (roomId: string, volume: number) => void;
}

export const DEFAULT_VOLUME = 1;
export const DEFAULT_STREAM_OPTIONS: StreamResolveOptions = {
  quality: '0',
  preferHls: false,
};

export function useStreamGrid(): UseStreamGridResult {
  const [streams, setStreams] = useState<StreamGridEntry[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [reloadingRoomId, setReloadingRoomId] = useState<string | null>(null);
  const [mutedRooms, setMutedRooms] = useState<Record<string, boolean>>({});
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const addingRef = useRef(false);
  const reloadingRef = useRef<string | null>(null);

  async function addStream(
    options: AddStreamOptions,
    onResolved?: (playback: StreamPlayback) => void,
  ): Promise<string | null> {
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
      setStreams((current) => [
        ...current,
        {
          playback,
          error: null,
          options: { quality: options.quality, preferHls: options.preferHls },
        },
      ]);
      setMutedRooms((current) => ({ ...current, [roomId]: false }));
      setVolumes((current) =>
        current[roomId] === undefined ? { ...current, [roomId]: DEFAULT_VOLUME } : current,
      );
      onResolved?.(playback);
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
    options?: StreamResolveOptions,
  ): Promise<string | null> {
    const entry = streams.find((item) => item.playback.roomId === roomId);
    if (!entry) return null;
    if (reloadingRef.current !== null) return '正在重新解析其他房间，请稍候';

    const effectiveOptions = options ?? entry.options;
    setStreams((current) =>
      current.map((item) =>
        item.playback.roomId === roomId
          ? { ...item, options: effectiveOptions, error: null }
          : item,
      ),
    );

    reloadingRef.current = roomId;
    setReloadingRoomId(roomId);
    try {
      const playback = unwrap(
        await window.api.streams.resolve({
          roomId,
          quality: effectiveOptions.quality,
          preferHls: effectiveOptions.preferHls,
        }),
      );
      setStreams((current) =>
        current.map((entry) =>
          entry.playback.roomId === roomId ? { ...entry, playback, error: null } : entry,
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

  async function setStreamOptions(
    roomId: string,
    patch: Partial<StreamResolveOptions>,
  ): Promise<string | null> {
    const entry = streams.find((item) => item.playback.roomId === roomId);
    if (!entry) return null;
    return reloadStream(roomId, { ...entry.options, ...patch });
  }

  function removeStream(roomId: string): void {
    const remaining = streams.filter((entry) => entry.playback.roomId !== roomId);
    setStreams(remaining);
    setMutedRooms((current) => {
      const next = { ...current };
      delete next[roomId];
      return next;
    });
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
    setMutedRooms({});
    setVolumes({});
    reloadingRef.current = null;
    setReloadingRoomId(null);
  }

  function toggleMute(roomId: string): void {
    const nextMuted = !(mutedRooms[roomId] ?? false);
    setMutedRooms((current) => ({ ...current, [roomId]: nextMuted }));
    if (!nextMuted && (volumes[roomId] ?? DEFAULT_VOLUME) <= 0) {
      setVolumes((current) => ({ ...current, [roomId]: DEFAULT_VOLUME }));
    }
  }

  function setVolume(roomId: string, volume: number): void {
    const nextVolume = Math.min(1, Math.max(0, volume));
    setVolumes((current) => ({ ...current, [roomId]: nextVolume }));
    setMutedRooms((current) => {
      const nextMuted = nextVolume <= 0;
      if ((current[roomId] ?? false) === nextMuted) return current;
      return { ...current, [roomId]: nextMuted };
    });
  }

  return {
    streams,
    isAdding,
    reloadingRoomId,
    mutedRooms,
    volumes,
    addStream,
    reloadStream,
    setStreamOptions,
    removeStream,
    clearStreams,
    toggleMute,
    setVolume,
  };
}
