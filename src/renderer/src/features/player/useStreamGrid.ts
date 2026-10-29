import { useRef, useState } from 'react';
import type { StreamPlatform, StreamPlayback, StreamQuality } from '@shared/contracts/stream';
import { errorMessage, unwrap } from '../../lib/api';
import { roomKey, streamKey } from '../../lib/streamIdentity';
import { canAddStream, MAX_STREAMS } from './streamGridLayout';
import { defaultQuality, qualityFromLabel } from './streamQuality';
import { getRoomPreference, saveRoomAlias, saveRoomPreference } from './viewingStorage';
import type { SavedRoom } from './viewingStorage';

export const ADD_CANCELLED = '添加已取消';

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
  volume?: number;
  defaultVolume?: number;
  muted?: boolean;
}

export interface UseStreamGridResult {
  streams: StreamGridEntry[];
  isAdding: boolean;
  reloadingKeys: string[];
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
  moveStream: (from: string, to: string) => void;
  replaceStream: (
    key: string,
    options: AddStreamOptions,
    onResolved?: (playback: StreamPlayback) => void,
  ) => Promise<string | null>;
}

export const DEFAULT_VOLUME = 1;

export function defaultStreamOptions(platform: StreamPlatform): StreamResolveOptions {
  return { quality: defaultQuality(platform), preferHls: false };
}

export function useStreamGrid(): UseStreamGridResult {
  const [streams, setStreams] = useState<StreamGridEntry[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [reloadingKeys, setReloadingKeys] = useState<string[]>([]);
  const [mutedRooms, setMutedRooms] = useState<Record<string, boolean>>({});
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const [soloKey, setSoloKey] = useState<string | null>(null);
  const addingRef = useRef<object | null>(null);
  const reloadingRef = useRef(new Map<string, object>());
  const nextInstanceId = useRef(0);
  const mutedBeforeSoloRef = useRef<Record<string, boolean> | null>(null);
  const streamsRef = useRef(streams);
  streamsRef.current = streams;

  function updateStreams(update: (current: StreamGridEntry[]) => StreamGridEntry[]): void {
    streamsRef.current = update(streamsRef.current);
    setStreams(streamsRef.current);
  }

  function remember(key: string, patch: Partial<SavedRoom>): void {
    const entry = streamsRef.current.find((item) => streamKey(item.playback) === key);
    if (!entry) return;
    const previous = getRoomPreference(entry.playback.platform, entry.playback.roomId);
    saveRoomPreference({
      platform: entry.playback.platform,
      roomId: entry.playback.roomId,
      ...entry.options,
      volume: previous?.volume ?? volumes[key] ?? DEFAULT_VOLUME,
      muted: previous?.muted ?? mutedRooms[key] ?? false,
      ...patch,
    });
  }

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
    if (streamsRef.current.some((entry) => streamKey(entry.playback) === requestedKey)) {
      return `房间 ${roomId} 已在多屏中`;
    }
    if (!canAddStream(streamsRef.current.length)) {
      return `最多同时播放 ${MAX_STREAMS} 路`;
    }

    const request = {};
    addingRef.current = request;
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
      if (addingRef.current !== request) return ADD_CANCELLED;
      const key = streamKey(playback);
      if (streamsRef.current.some((entry) => streamKey(entry.playback) === key)) {
        return `房间 ${playback.roomId} 已在多屏中`;
      }
      const actualQuality =
        qualityFromLabel(playback.platform, playback.quality) ?? options.quality;
      const instanceId = ++nextInstanceId.current;
      updateStreams((current) => [
        ...current,
        {
          instanceId,
          playback,
          error: null,
          options: { quality: actualQuality, preferHls: options.preferHls },
        },
      ]);
      const saved = getRoomPreference(playback.platform, playback.roomId);
      const initialMuted = options.muted ?? saved?.muted ?? false;
      const initialVolume =
        options.volume ?? saved?.volume ?? options.defaultVolume ?? DEFAULT_VOLUME;
      if (mutedBeforeSoloRef.current) mutedBeforeSoloRef.current[key] = initialMuted;
      setMutedRooms((current) => ({
        ...current,
        [key]: mutedBeforeSoloRef.current !== null || initialMuted,
      }));
      setVolumes((current) => ({ ...current, [key]: initialVolume }));
      remember(key, { volume: initialVolume, muted: initialMuted });
      saveRoomAlias(playback.platform, roomId, playback.roomId);
      onResolved?.(playback);
      return null;
    } catch (error) {
      if (addingRef.current !== request) return ADD_CANCELLED;
      return errorMessage(error);
    } finally {
      if (addingRef.current === request) {
        addingRef.current = null;
        setIsAdding(false);
      }
    }
  }

  async function reloadStream(key: string, options?: StreamResolveOptions): Promise<string | null> {
    const entry = streamsRef.current.find((item) => streamKey(item.playback) === key);
    if (!entry) return null;
    // 各房间独立恢复，避免多路同时断流时消耗了重试机会却没有发起请求。
    if (reloadingRef.current.has(key)) return '正在重新解析该房间，请稍候';

    const effectiveOptions = options ?? entry.options;
    updateStreams((current) =>
      current.map((item) => (streamKey(item.playback) === key ? { ...item, error: null } : item)),
    );

    const request = { key };
    reloadingRef.current.set(key, request);
    setReloadingKeys((current) => [...current, key]);
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
      if (reloadingRef.current.get(key) !== request) return null;
      updateStreams((current) =>
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
      remember(key, {});
      return null;
    } catch (error) {
      if (reloadingRef.current.get(key) !== request) return null;
      const message = errorMessage(error);
      updateStreams((current) =>
        current.map((item) =>
          item.instanceId === entry.instanceId ? { ...item, error: message } : item,
        ),
      );
      return null;
    } finally {
      if (reloadingRef.current.get(key) === request) {
        reloadingRef.current.delete(key);
        setReloadingKeys((current) => current.filter((item) => item !== key));
      }
    }
  }

  async function setStreamOptions(
    key: string,
    patch: Partial<StreamResolveOptions>,
  ): Promise<string | null> {
    const entry = streamsRef.current.find((item) => streamKey(item.playback) === key);
    if (!entry) return null;
    return reloadStream(key, { ...entry.options, ...patch });
  }

  async function replaceStream(
    key: string,
    options: AddStreamOptions,
    onResolved?: (playback: StreamPlayback) => void,
  ): Promise<string | null> {
    const entry = streamsRef.current.find((item) => streamKey(item.playback) === key);
    if (!entry) return ADD_CANCELLED;
    if (reloadingRef.current.has(key)) return '正在重新解析该房间，请稍候';
    const request = {};
    reloadingRef.current.set(key, request);
    setReloadingKeys((current) => [...current, key]);
    try {
      const playback = unwrap(
        await window.api.streams.resolve({
          platform: options.platform,
          roomId: options.roomId,
          quality: options.quality,
          preferHls: options.preferHls,
        }),
      );
      if (reloadingRef.current.get(key) !== request) return ADD_CANCELLED;
      const nextKey = streamKey(playback);
      if (
        streamsRef.current.some(
          (item) => item.instanceId !== entry.instanceId && streamKey(item.playback) === nextKey,
        )
      )
        return `房间 ${playback.roomId} 已在多屏中`;
      const preference = getRoomPreference(playback.platform, playback.roomId);
      const muted = options.muted ?? preference?.muted ?? false;
      const volume =
        options.volume ?? preference?.volume ?? options.defaultVolume ?? DEFAULT_VOLUME;
      const restored = mutedBeforeSoloRef.current
        ? restoredMutedRooms(streamsRef.current.map((item) => streamKey(item.playback)))
        : null;
      mutedBeforeSoloRef.current = null;
      setSoloKey(null);
      updateStreams((current) =>
        current.map((item) =>
          item.instanceId === entry.instanceId
            ? {
                instanceId: ++nextInstanceId.current,
                playback,
                error: null,
                options: {
                  quality: qualityFromLabel(playback.platform, playback.quality) ?? options.quality,
                  preferHls: options.preferHls,
                },
              }
            : item,
        ),
      );
      setMutedRooms((current) => {
        const next = { ...(restored ?? current) };
        delete next[key];
        return { ...next, [nextKey]: muted };
      });
      setVolumes((current) => {
        const next = { ...current };
        delete next[key];
        return { ...next, [nextKey]: volume };
      });
      remember(nextKey, { muted, volume });
      saveRoomAlias(playback.platform, options.roomId, playback.roomId);
      onResolved?.(playback);
      return null;
    } catch (reason) {
      return reloadingRef.current.get(key) === request ? errorMessage(reason) : ADD_CANCELLED;
    } finally {
      if (reloadingRef.current.get(key) === request) {
        reloadingRef.current.delete(key);
        setReloadingKeys((current) => current.filter((item) => item !== key));
      }
    }
  }

  function removeStream(key: string): void {
    const remainingKeys = streams
      .filter((entry) => streamKey(entry.playback) !== key)
      .map((entry) => streamKey(entry.playback));
    updateStreams((current) => current.filter((entry) => streamKey(entry.playback) !== key));
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
    reloadingRef.current.delete(key);
    setReloadingKeys((current) => current.filter((item) => item !== key));
  }

  function clearStreams(): void {
    addingRef.current = null;
    setIsAdding(false);
    updateStreams(() => []);
    setMutedRooms({});
    setVolumes({});
    setSoloKey(null);
    mutedBeforeSoloRef.current = null;
    reloadingRef.current.clear();
    setReloadingKeys([]);
  }

  function toggleMute(key: string): void {
    if (soloKey !== null) {
      setSoloKey(null);
      mutedBeforeSoloRef.current = null;
    }
    const nextMuted = !(mutedRooms[key] ?? false);
    remember(key, {
      muted: nextMuted,
      ...(!nextMuted && (volumes[key] ?? DEFAULT_VOLUME) <= 0 ? { volume: DEFAULT_VOLUME } : {}),
    });
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
    remember(key, { volume: nextVolume, muted: nextVolume <= 0 });
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

  function moveStream(from: string, to: string): void {
    updateStreams((current) => {
      const source = current.findIndex((entry) => streamKey(entry.playback) === from);
      const target = current.findIndex((entry) => streamKey(entry.playback) === to);
      if (source < 0 || target < 0 || source === target) return current;
      const next = [...current];
      const [entry] = next.splice(source, 1);
      next.splice(target, 0, entry!);
      return next;
    });
  }

  return {
    streams,
    isAdding,
    reloadingKeys,
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
    moveStream,
    replaceStream,
  };
}
