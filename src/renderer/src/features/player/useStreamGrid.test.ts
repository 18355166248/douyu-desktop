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

describe('stream reload lifetimes', () => {  it.each(['success', 'failure'] as const)(
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
    expect(render().reloadingKey).toBe('douyu:1');
    expect(await render().reloadStream('douyu:1')).toContain('正在重新解析');
    finishNew(ok(playback('latest')));
    await current;
    expect(render().streams[0]?.playback.url).toBe('latest');
    expect(render().reloadingKey).toBeNull();
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
