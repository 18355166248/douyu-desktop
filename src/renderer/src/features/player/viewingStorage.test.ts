import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getRoomPreference,
  clearLastViewing,
  loadLastViewing,
  loadScenes,
  saveLastViewing,
  saveRoomPreference,
  saveRoomAlias,
  saveScenes,
} from './viewingStorage';
import type { SavedRoom, ViewingScene } from './viewingStorage';

const storage = new Map<string, string>();
const room: SavedRoom = {
  platform: 'douyu',
  roomId: '1',
  quality: '3',
  preferHls: true,
  volume: 0.35,
  muted: true,
};
const scene: ViewingScene = {
  id: 'one',
  name: '比赛',
  rooms: [room],
  layout: 'focus',
  mainKey: 'douyu:1',
};
beforeEach(() => {
  storage.clear();
  vi.stubGlobal('window', {
    location: { search: '' },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
});
afterEach(() => vi.unstubAllGlobals());
describe('viewing persistence', () => {
  it('keeps audio, quality and protocol separate by platform', () => {
    saveRoomPreference(room);
    saveRoomPreference({ ...room, platform: 'bilibili', quality: '250', volume: 0.8 });
    expect(getRoomPreference('douyu', '1')).toEqual(room);
    expect(getRoomPreference('bilibili', '1')?.volume).toBe(0.8);
  });
  it('persists scene order and keeps the secondary snapshot separate', () => {
    expect(saveScenes([scene])).toBe(true);
    expect(loadScenes()).toEqual([scene]);
    saveLastViewing(scene);
    window.location.search = '?role=secondary';
    expect(loadLastViewing()).toBeNull();
    saveLastViewing({ ...scene, name: '副屏一' });
    window.location.search = '?role=secondary&workspace=secondary-2';
    expect(loadLastViewing()).toBeNull();
    window.location.search = '';
    expect(loadLastViewing()).toEqual(scene);
    clearLastViewing();
    expect(loadLastViewing()).toBeNull();
  });
  it('uses canonical preferences for short room aliases after later changes', () => {
    saveRoomPreference(room);
    saveRoomAlias('douyu', 'short', '1');
    saveRoomPreference({ ...room, volume: 0.6 });
    expect(getRoomPreference('douyu', 'short')?.volume).toBe(0.6);
  });
  it('discards corrupt, duplicated and unsupported-platform-quality scenes', () => {
    storage.set(
      'douyu-desktop.viewing-scenes.v1',
      JSON.stringify([
        scene,
        { ...scene, rooms: [room, room] },
        { ...scene, rooms: [{ ...room, quality: '2000' }] },
        null,
      ]),
    );
    expect(loadScenes()).toEqual([scene]);
    storage.set('douyu-desktop.viewing-scenes.v1', '{broken');
    expect(loadScenes()).toEqual([]);
  });
  it('bounds room preferences and fails gracefully if storage is blocked', () => {
    for (let i = 0; i < 205; i++) saveRoomPreference({ ...room, roomId: String(i) });
    expect(getRoomPreference('douyu', '0')).toBeUndefined();
    expect(getRoomPreference('douyu', '204')).toBeDefined();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      },
    });
    expect(loadScenes()).toEqual([]);
    expect(saveScenes([scene])).toBe(false);
  });
});
