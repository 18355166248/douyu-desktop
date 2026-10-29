import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  loadPlaybackPreferences,
  newRoomOptions,
  preferredQuality,
  savePlaybackPreferences,
} from './playbackPreferences';
import { saveRoomAlias, saveRoomPreference } from './viewingStorage';
const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
});
afterEach(() => vi.unstubAllGlobals());
it('keeps defaults and falls back when preferences are corrupt', () => {
  expect(newRoomOptions('douyu', '1', true)).toMatchObject({
    quality: '0',
    defaultVolume: 1,
  });
  storage.set('douyu-desktop.playback-preferences.v1', '{broken');
  expect(loadPlaybackPreferences()).toEqual({
    balancedQuality: false,
    muteNewRooms: false,
    volume: 1,
  });
});
it('persists balanced quality and audio defaults for new rooms on all platforms', () => {
  savePlaybackPreferences({ balancedQuality: true, muteNewRooms: true, volume: 0.35 });
  expect(newRoomOptions('douyu', '1', false)).toMatchObject({
    quality: '0',
    muted: true,
    defaultVolume: 0.35,
  });
  expect(newRoomOptions('douyu', '2', true).quality).toBe('3');
  expect(newRoomOptions('bilibili', '2', true).quality).toBe('150');
  expect(newRoomOptions('huya', '2', true).quality).toBe('2000');
  expect(preferredQuality('bilibili', false)).toBe('10000');
});
it('preserves explicit room quality and volume while honoring default mute, including aliases', () => {
  saveRoomPreference({
    platform: 'douyu',
    roomId: '100',
    quality: '4',
    preferHls: true,
    volume: 0.6,
    muted: false,
  });
  saveRoomAlias('douyu', '1', '100');
  savePlaybackPreferences({ balancedQuality: true, muteNewRooms: true, volume: 0.35 });
  expect(newRoomOptions('douyu', '1', true)).toEqual({
    platform: 'douyu',
    roomId: '1',
    defaultVolume: 0.35,
    quality: '4',
    preferHls: true,
    volume: 0.6,
    muted: true,
  });
});
it('reports failed persistence without replacing the previous preference', () => {
  window.localStorage.setItem = () => {
    throw new Error('full');
  };
  expect(savePlaybackPreferences({ balancedQuality: true, muteNewRooms: true, volume: 0.2 })).toBe(
    false,
  );
  expect(loadPlaybackPreferences().muteNewRooms).toBe(false);
});
