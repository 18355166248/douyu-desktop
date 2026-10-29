import { saveRoomPreference } from './viewingStorage';
import { newRoomOptions, savePlaybackPreferences } from './playbackPreferences';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStreamGrid } from './useStreamGrid';
import type { StreamPlayback } from '@shared/contracts/stream';
import { ok } from '@shared/contracts/result';

// A deterministic hook host lets these tests control IPC completion order
// without needing a DOM or live Electron session.
const host = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }));
vi.mock('react', () => ({
  useState<T>(initial: T) {
    const index = host.cursor++;
    if (!(index in host.slots)) host.slots[index] = initial;
    return [
      host.slots[index],
      (value: T | ((current: T) => T)) => {
        host.slots[index] =
          typeof value === 'function'
            ? (value as (current: T) => T)(host.slots[index] as T)
            : value;
      },
    ];
  },
  useRef<T>(initial: T) {
    const index = host.cursor++;
    if (!(index in host.slots)) host.slots[index] = { current: initial };
    return host.slots[index];
  },
}));

const resolveStream = vi.fn();
const playback = (url: string, roomId = '1'): StreamPlayback => ({
  platform: 'douyu',
  roomId,
  title: '',
  anchorName: '',
  url,
  format: 'flv',
  quality: '高清',
});
const input = { platform: 'douyu' as const, roomId: '1', quality: '3' as const, preferHls: false };
function render() {
  host.cursor = 0;
  // eslint-disable-next-line react-hooks/rules-of-hooks -- React is replaced by the deterministic hook host above.
  return useStreamGrid();
}

beforeEach(() => {
  host.slots = [];
  resolveStream.mockReset();
  vi.stubGlobal('window', { api: { streams: { resolve: resolveStream } } });
});
afterEach(() => vi.unstubAllGlobals());

describe('stream reload lifetimes', () => {
  it('does not let a cancelled add unlock a newer add', async () => {
    let finishOld!: (value: ReturnType<typeof ok<StreamPlayback>>) => void;
    let finishNew!: (value: ReturnType<typeof ok<StreamPlayback>>) => void;
    resolveStream.mockReturnValueOnce(
      new Promise((resolve) => {
        finishOld = resolve;
      }),
    );
    const old = render().addStream(input);
    render().clearStreams();
    resolveStream.mockReturnValueOnce(
      new Promise((resolve) => {
        finishNew = resolve;
      }),
    );
    const current = render().addStream({ ...input, roomId: '2' });
    finishOld(ok(playback('stale')));
    await old;
    expect(render().isAdding).toBe(true);
    expect(await render().addStream(input)).toContain('正在解析其他房间');
    finishNew(ok(playback('new', '2')));
    await current;
    expect(render().isAdding).toBe(false);
    expect(render().streams.map((entry) => entry.playback.roomId)).toEqual(['2']);
  });

  it('enforces the six-room limit even when one callback restores all rooms', async () => {
    const grid = render();
    for (let id = 1; id <= 6; id++) {
      resolveStream.mockResolvedValueOnce(ok(playback('room', String(id))));
      expect(await grid.addStream({ ...input, roomId: String(id) })).toBeNull();
    }
    expect(await grid.addStream({ ...input, roomId: '7' })).toContain('最多同时播放 6 路');
    expect(render().streams).toHaveLength(6);
    expect(resolveStream).toHaveBeenCalledTimes(6);
  });
  it('preserves the original room on replacement failure and replaces in place on success', async () => {
    resolveStream
      .mockResolvedValueOnce(ok(playback('one')))
      .mockResolvedValueOnce(ok(playback('two', '2')));
    await render().addStream(input);
    await render().addStream({ ...input, roomId: '2' });
    resolveStream.mockRejectedValueOnce(new Error('offline'));
    expect(await render().replaceStream('douyu:1', { ...input, roomId: '3' })).toContain('offline');
    expect(render().streams.map((entry) => entry.playback.roomId)).toEqual(['1', '2']);
    resolveStream.mockResolvedValueOnce(ok(playback('new', '3')));
    expect(
      await render().replaceStream('douyu:1', { ...input, roomId: '3', volume: 0.4, muted: true }),
    ).toBeNull();
    expect(render().streams.map((entry) => entry.playback.roomId)).toEqual(['3', '2']);
    expect(render().volumes['douyu:3']).toBe(0.4);
    expect(render().mutedRooms['douyu:3']).toBe(true);
    expect(render().reloadingKeys).toEqual([]);
  });
  it('rejects duplicate replacements and discards replacements after a clear', async () => {
    resolveStream
      .mockResolvedValueOnce(ok(playback('one')))
      .mockResolvedValueOnce(ok(playback('two', '2')));
    await render().addStream(input);
    await render().addStream({ ...input, roomId: '2' });
    resolveStream.mockResolvedValueOnce(ok(playback('two', '2')));
    expect(await render().replaceStream('douyu:1', { ...input, roomId: '2' })).toContain(
      '已在多屏中',
    );
    let finish!: (value: ReturnType<typeof ok<StreamPlayback>>) => void;
    resolveStream.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const pending = render().replaceStream('douyu:1', { ...input, roomId: '3' });
    render().clearStreams();
    finish(ok(playback('stale', '3')));
    expect(await pending).toBe('添加已取消');
    expect(render().streams).toEqual([]);
  });
  it.each(['success', 'failure'])(
    'discards an in-flight add %s after clearing',
    async (outcome) => {
      let finish!: (value: ReturnType<typeof ok<StreamPlayback>>) => void;
      let reject!: (error: Error) => void;
      resolveStream.mockReturnValueOnce(
        new Promise((yes, no) => {
          finish = yes;
          reject = no;
        }),
      );
      const visited = vi.fn();
      const pending = render().addStream(input, visited);
      render().clearStreams();
      resolveStream.mockResolvedValueOnce(ok(playback('new', '2')));
      await render().addStream({ ...input, roomId: '2' });
      if (outcome === 'success') finish(ok(playback('old')));
      else reject(new Error('old'));
      expect(await pending).toBe('添加已取消');
      expect(render().streams.map((entry) => entry.playback.roomId)).toEqual(['2']);
      expect(visited).not.toHaveBeenCalled();
      expect(render().isAdding).toBe(false);
    },
  );

  it('uses the latest room list when sequentially restoring a combination', async () => {
    const grid = render();
    resolveStream
      .mockResolvedValueOnce(ok(playback('one')))
      .mockResolvedValueOnce(ok(playback('two', '2')));
    await grid.addStream(input);
    await grid.addStream({ ...input, roomId: '2' });
    expect(render().streams).toHaveLength(2);
    expect(await grid.addStream(input)).toContain('已在多屏中');
    render().moveStream('douyu:2', 'douyu:1');
    expect(render().streams.map((entry) => entry.playback.roomId)).toEqual(['2', '1']);
  });
  it.each(['success', 'failure'] as const)(
    'ignores an old %s after closing and re-adding a room',
    async (outcome) => {
      resolveStream.mockResolvedValueOnce(ok(playback('initial')));
      await render().addStream(input);
      let finish!: (value: ReturnType<typeof ok<StreamPlayback>>) => void;
      let reject!: (error: Error) => void;
      resolveStream.mockReturnValueOnce(
        new Promise((yes, no) => {
          finish = yes;
          reject = no;
        }),
      );
      const old = render().reloadStream('douyu:1');
      render().removeStream('douyu:1');
      resolveStream.mockResolvedValueOnce(ok(playback('fresh')));
      await render().addStream(input);
      if (outcome === 'success') finish(ok({ ...playback('stale'), quality: '原画' }));
      else reject(new Error('old error'));
      await old;
      expect(render().streams[0]).toMatchObject({
        playback: { url: 'fresh', quality: '高清' },
        options: { quality: '3' },
        error: null,
      });
    },
  );

  it('reloads different rooms concurrently without dropping either recovery', async () => {
    resolveStream.mockResolvedValueOnce(ok(playback('one')));
    await render().addStream(input);
    resolveStream.mockResolvedValueOnce(ok(playback('two', '2')));
    await render().addStream({ ...input, roomId: '2' });
    let finish!: (value: ReturnType<typeof ok<StreamPlayback>>) => void;
    resolveStream.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const first = render().reloadStream('douyu:1');
    resolveStream.mockResolvedValueOnce(ok(playback('two-new', '2')));
    await render().reloadStream('douyu:2');
    expect(render().streams[1]?.playback.url).toBe('two-new');
    expect(render().reloadingKeys).toEqual(['douyu:1']);
    finish(ok(playback('one-new')));
    await first;
    expect(render().reloadingKeys).toEqual([]);
  });

  it('does not let an old finally unlock a newer reload', async () => {
    resolveStream.mockResolvedValueOnce(ok(playback('initial')));
    await render().addStream(input);
    let finishOld!: (value: ReturnType<typeof ok<StreamPlayback>>) => void;
    resolveStream.mockReturnValueOnce(
      new Promise((resolve) => {
        finishOld = resolve;
      }),
    );
    const old = render().reloadStream('douyu:1');
    render().clearStreams();
    resolveStream.mockResolvedValueOnce(ok(playback('fresh')));
    await render().addStream(input);
    let finishNew!: (value: ReturnType<typeof ok<StreamPlayback>>) => void;
    resolveStream.mockReturnValueOnce(
      new Promise((resolve) => {
        finishNew = resolve;
      }),
    );
    const current = render().reloadStream('douyu:1');
    finishOld(ok(playback('stale')));
    await old;
    expect(render().reloadingKeys).toEqual(['douyu:1']);
    expect(await render().reloadStream('douyu:1')).toContain('正在重新解析');
    finishNew(ok(playback('latest')));
    await current;
    expect(render().streams[0]?.playback.url).toBe('latest');
    expect(render().reloadingKeys).toEqual([]);
  });
});

describe('audio solo', () => {
  it('mutes the other rooms and restores their previous state', async () => {
    resolveStream.mockResolvedValueOnce(ok(playback('one', '1')));
    await render().addStream({ ...input, roomId: '1' });
    resolveStream.mockResolvedValueOnce(ok(playback('two', '2')));
    await render().addStream({ ...input, roomId: '2' });

    render().toggleSolo('douyu:1');
    let state = render();
    expect(state.soloKey).toBe('douyu:1');
    expect(state.mutedRooms).toEqual({ 'douyu:1': false, 'douyu:2': true });

    render().toggleSolo('douyu:1');
    state = render();
    expect(state.soloKey).toBeNull();
    expect(state.mutedRooms).toEqual({ 'douyu:1': false, 'douyu:2': false });
  });

  it('keeps a room muted when it was muted before soloing', async () => {
    resolveStream.mockResolvedValueOnce(ok(playback('one', '1')));
    await render().addStream({ ...input, roomId: '1' });
    resolveStream.mockResolvedValueOnce(ok(playback('two', '2')));
    await render().addStream({ ...input, roomId: '2' });

    render().toggleMute('douyu:2');
    render().toggleSolo('douyu:1');
    expect(render().mutedRooms).toEqual({ 'douyu:1': false, 'douyu:2': true });

    render().toggleSolo('douyu:1');
    expect(render().soloKey).toBeNull();
    expect(render().mutedRooms).toEqual({ 'douyu:1': false, 'douyu:2': true });
  });

  it('mutes a room added while another room is soloed', async () => {
    resolveStream.mockResolvedValueOnce(ok(playback('one', '1')));
    await render().addStream({ ...input, roomId: '1' });
    resolveStream.mockResolvedValueOnce(ok(playback('two', '2')));
    await render().addStream({ ...input, roomId: '2' });
    render().toggleSolo('douyu:1');

    resolveStream.mockResolvedValueOnce(ok(playback('three', '3')));
    await render().addStream({ ...input, roomId: '3' });
    expect(render().soloKey).toBe('douyu:1');
    expect(render().mutedRooms).toEqual({
      'douyu:1': false,
      'douyu:2': true,
      'douyu:3': true,
    });

    render().toggleSolo('douyu:1');
    expect(render().mutedRooms).toEqual({
      'douyu:1': false,
      'douyu:2': false,
      'douyu:3': false,
    });
  });
});

it('uses canonical audio memory on first short-id resolution, with defaults only as fallback', async () => {
  const storage = new Map<string, string>();
  Object.assign(window, {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
  savePlaybackPreferences({ balancedQuality: true, muteNewRooms: false, volume: 0.2 });
  saveRoomPreference({
    platform: 'douyu',
    roomId: '100',
    quality: '3',
    preferHls: false,
    volume: 0.7,
    muted: true,
  });
  resolveStream.mockResolvedValueOnce(ok(playback('canonical', '100')));
  await render().addStream(newRoomOptions('douyu', 'short', false));
  expect(render().volumes['douyu:100']).toBe(0.7);
  expect(render().mutedRooms['douyu:100']).toBe(true);
  resolveStream.mockResolvedValueOnce(ok(playback('new', '200')));
  await render().replaceStream('douyu:100', newRoomOptions('douyu', 'other-short', false));
  expect(render().volumes['douyu:200']).toBe(0.2);
  expect(render().mutedRooms['douyu:200']).toBe(false);
  resolveStream.mockResolvedValueOnce(ok(playback('canonical', '100')));
  await render().replaceStream('douyu:200', { ...input, roomId: '100', volume: 0.4, muted: false });
  expect(render().volumes['douyu:100']).toBe(0.4);
  expect(render().mutedRooms['douyu:100']).toBe(false);
});
