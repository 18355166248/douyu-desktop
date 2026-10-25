import { useRef, useState } from 'react';
import type { StreamPlatform, StreamPlayback, StreamQuality } from '@shared/contracts/stream';
import { errorMessage, unwrap } from '../../lib/api';
import { roomKey, streamKey } from '../../lib/streamIdentity';
import { canAddStream, MAX_STREAMS } from './streamGridLayout';
import { defaultQuality, qualityFromLabel } from './streamQuality';

export interface StreamGridEntry {
  instanceId: number;
  playback: StreamPlayback;
  error: string | null;
  options: StreamResolveOptions;
}

export interface StreamResolveOptions {
  quality: StreamQuality;
  preferHls: boolean;
}

export interface AddStreamOptions extends StreamResolveOptions {
  platform: StreamPlatform;
  roomId: string;
}

export interface UseStreamGridResult {
  streams: StreamGridEntry[];
  isAdding: boolean;
  reloadingKey: string | null;
  mutedRooms: Record<string, boolean>;
  volumes: Record<string, number>;
  soloKey: string | null;
  addStream: (
    options: AddStreamOptions,
    onResolved?: (playback: StreamPlayback) => void,
  ) => Promise<string | null>;
  reloadStream: (key: string, options?: StreamResolveOptions) => Promise<string | null>;
  setStreamOptions: (key: string, patch: Partial<StreamResolveOptions>) => Promise<string | null>;
  removeStream: (key: string) => void;
  clearStreams: () => void;
  toggleMute: (key: string) => void;
  toggleSolo: (key: string) => void;
  setVolume: (key: string, volume: number) => void;
}

export const DEFAULT_VOLUME = 1;

export function defaultStreamOptions(platform: StreamPlatform): StreamResolveOptions {
  return { quality: defaultQuality(platform), preferHls: false };
}

export function useStreamGrid(): UseStreamGridResult {
  const [streams, setStreams] = useState<StreamGridEntry[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [reloadingKey, setReloadingKey] = useState<string | null>(null);
  const [mutedRooms, setMutedRooms] = useState<Record<string, boolean>>({});
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const [soloKey, setSoloKey] = useState<string | null>(null);
  const addingRef = useRef(false);
  const reloadingRef = useRef<{ key: string } | null>(null);
  const nextInstanceId = useRef(0);
  const mutedBeforeSoloRef = useRef<Record<string, boolean> | null>(null);

  function restoredMutedRooms(keys: readonly string[]): Record<string, boolean> {
    const snapshot = mutedBeforeSoloRef.current ?? {};
    return Object.fromEntries(keys.map((key) => [key, snapshot[key] === true]));
  }

  async function addStream(
    options: AddStreamOptions,
    onResolved?: (playback: StreamPlayback) => void,
  ): Promise<string | null> {
    const roomId = options.roomId.trim();
    if (!roomId) {
      if (options.platform === 'bilibili') return '请输入 B 站房间号';
      if (options.platform === 'huya') return '请输入虎牙房间号';
      return '请输入斗鱼房间号';
    }
    if (addingRef.current) return '正在解析其他房间，请稍候';
    const requestedKey = roomKey(options.platform, roomId);
    if (streams.some((entry) => streamKey(entry.playback) === requestedKey)) {
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
          platform: options.platform,
          roomId,
          quality: options.quality,
          preferHls: options.preferHls,
        }),
      );
      const key = streamKey(playback);
      if (streams.some((entry) => streamKey(entry.playback) === key)) {
        return `房间 ${playback.roomId} 已在多屏中`;
      }
      const actualQuality =
        qualityFromLabel(playback.platform, playback.quality) ?? options.quality;
      const instanceId = ++nextInstanceId.current;
      setStreams((current) => [
        ...current,
        {
          instanceId,
          playback,
          error: null,
          options: { quality: actualQuality, preferHls: options.preferHls },
        },
      ]);
      setMutedRooms((current) => ({
        ...current,
        [key]: mutedBeforeSoloRef.current !== null,
      }));
      setVolumes((current) =>
        current[key] === undefined ? { ...current, [key]: DEFAULT_VOLUME } : current,
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

  async function reloadStream(key: string, options?: StreamResolveOptions): Promise<string | null> {
    const entry = streams.find((item) => streamKey(item.playback) === key);
    if (!entry) return null;
    if (reloadingRef.current !== null) return '正在重新解析其他房间，请稍候';

    const effectiveOptions = options ?? entry.options;
    setStreams((current) =>
      current.map((item) =>
        streamKey(item.playback) === key
          ? { ...item, options: effectiveOptions, error: null }
          : item,
      ),
    );

    const request = { key };
    reloadingRef.current = request;
    setReloadingKey(key);
    try {
      const playback = unwrap(
        await window.api.streams.resolve({
          platform: entry.playback.platform,
          roomId: entry.playback.roomId,
          quality: effectiveOptions.quality,
          preferHls: effectiveOptions.preferHls,
        }),
      );
      const actualQuality =
        qualityFromLabel(playback.platform, playback.quality) ?? effectiveOptions.quality;
      if (reloadingRef.current !== request) return null;
      setStreams((current) =>
        current.map((item) =>
          item.instanceId === entry.instanceId
            ? {
                ...item,
                playback,
                options: { ...effectiveOptions, quality: actualQuality },
                error: null,
              }
            : item,
        ),
      );
      return null;
    } catch (error) {
      if (reloadingRef.current !== request) return null;
      const message = errorMessage(error);
      setStreams((current) =>
        current.map((item) =>
          item.instanceId === entry.instanceId ? { ...item, error: message } : item,
        ),
      );
      return null;
    } finally {
      if (reloadingRef.current === request) {
        reloadingRef.current = null;
        setReloadingKey(null);
      }
    }
  }

  async function setStreamOptions(
    key: string,
    patch: Partial<StreamResolveOptions>,
  ): Promise<string | null> {
    const entry = streams.find((item) => streamKey(item.playback) === key);
    if (!entry) return null;
    return reloadStream(key, { ...entry.options, ...patch });
  }

  function removeStream(key: string): void {
    const remainingKeys = streams
      .filter((entry) => streamKey(entry.playback) !== key)
      .map((entry) => streamKey(entry.playback));
    setStreams((current) => current.filter((entry) => streamKey(entry.playback) !== key));
    if (soloKey === key) {
      setMutedRooms(restoredMutedRooms(remainingKeys));
      setSoloKey(null);
      mutedBeforeSoloRef.current = null;
    } else {
      setMutedRooms((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      if (remainingKeys.length < 2 && soloKey !== null) {
        setSoloKey(null);
        mutedBeforeSoloRef.current = null;
      }
    }
    setVolumes((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    if (reloadingRef.current?.key === key) {
      reloadingRef.current = null;
      setReloadingKey(null);
    }
  }

  function clearStreams(): void {
    setStreams([]);
    setMutedRooms({});
    setVolumes({});
    setSoloKey(null);
    mutedBeforeSoloRef.current = null;
    reloadingRef.current = null;
    setReloadingKey(null);
  }

  function toggleMute(key: string): void {
    if (soloKey !== null) {
      setSoloKey(null);
      mutedBeforeSoloRef.current = null;
    }
    const nextMuted = !(mutedRooms[key] ?? false);
    setMutedRooms((current) => ({ ...current, [key]: nextMuted }));
    if (!nextMuted && (volumes[key] ?? DEFAULT_VOLUME) <= 0) {
      setVolumes((current) => ({ ...current, [key]: DEFAULT_VOLUME }));
    }
  }

  function toggleSolo(key: string): void {
    if (streams.length < 2 || !streams.some((entry) => streamKey(entry.playback) === key)) {
      return;
    }

    if (soloKey === key) {
      const keys = streams.map((entry) => streamKey(entry.playback));
      setMutedRooms(restoredMutedRooms(keys));
      setSoloKey(null);
      mutedBeforeSoloRef.current = null;
      return;
    }

    if (soloKey === null) {
      mutedBeforeSoloRef.current = { ...mutedRooms };
    }
    const next: Record<string, boolean> = {};
    for (const entry of streams) {
      const entryKey = streamKey(entry.playback);
      next[entryKey] = entryKey !== key;
    }
    setMutedRooms(next);
    setSoloKey(key);
  }

  function setVolume(key: string, volume: number): void {
    const nextVolume = Math.min(1, Math.max(0, volume));
    if (
      soloKey !== null &&
      ((key !== soloKey && nextVolume > 0) || (key === soloKey && nextVolume <= 0))
    ) {
      setSoloKey(null);
      mutedBeforeSoloRef.current = null;
    }
    setVolumes((current) => ({ ...current, [key]: nextVolume }));
    setMutedRooms((current) => {
      const nextMuted = nextVolume <= 0;
      if ((current[key] ?? false) === nextMuted) return current;
      return { ...current, [key]: nextMuted };
    });
  }

  return {
    streams,
    isAdding,
    reloadingKey,
    mutedRooms,
    volumes,
    soloKey,
    addStream,
    reloadStream,
    setStreamOptions,
    removeStream,
    clearStreams,
    toggleMute,
    toggleSolo,
    setVolume,
  };
}
