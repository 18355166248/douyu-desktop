import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSpecialFollows } from './useSpecialFollows';
import { ok, fail } from '@shared/contracts/result';
import type { SpecialFollowEntry } from '@shared/contracts/specialFollow';
const host = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  effects: [] as (() => unknown)[],
}));
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
  useCallback: (callback: unknown) => callback,
  useEffect(effect: () => unknown) {
    const index = host.cursor++;
    if (!(index in host.slots)) {
      host.slots[index] = true;
      host.effects.push(effect);
    }
  },
}));
const room = (roomId: string): SpecialFollowEntry => ({
  platform: 'douyu',
  roomId,
  name: roomId,
  title: roomId,
  addedAt: 1,
});
const load = vi.fn();
const toggle = vi.fn();
let broadcast: (rooms: SpecialFollowEntry[]) => void;
function render() {
  host.cursor = 0;
  // eslint-disable-next-line react-hooks/rules-of-hooks -- 用确定性 hook host 控制 IPC 完成顺序。
  const result = useSpecialFollows();
  host.effects.splice(0).forEach((effect) => effect());
  return result;
}
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
beforeEach(() => {
  host.slots = [];
  host.effects = [];
  load.mockReset().mockResolvedValue(ok([room('1')]));
  toggle.mockReset();
  vi.stubGlobal('window', {
    api: {
      special: {
        load,
        toggle,
        onChange: (callback: typeof broadcast) => {
          broadcast = callback;
          return () => {};
        },
      },
    },
  });
});
afterEach(() => vi.unstubAllGlobals());
it('rolls back failed removal and allows retry after a failed Result', async () => {
  render();
  await flush();
  toggle.mockResolvedValueOnce(fail({ code: 'INTERNAL', message: '磁盘已满', retryable: false }));
  render().toggle(room('1'));
  expect(render().entries).toEqual([]);
  expect(render().busy).toBe(true);
  await flush();
  expect(render().entries).toEqual([room('1')]);
  expect(render().error).toBe('磁盘已满');
  expect(render().busy).toBe(false);
  toggle.mockResolvedValueOnce(ok([]));
  render().toggle(room('1'));
  await flush();
  expect(render().entries).toEqual([]);
});
it('rolls back rejected additions to the newest cross-window snapshot and blocks double clicks', async () => {
  render();
  await flush();
  let reject!: (error: Error) => void;
  toggle.mockReturnValue(
    new Promise((_, no) => {
      reject = no;
    }),
  );
  render().toggle(room('2'));
  expect(render().entries.map((r) => r.roomId)).toEqual(['2', '1']);
  render().toggle(room('2'));
  expect(toggle).toHaveBeenCalledTimes(1);
  broadcast([room('1'), room('3')]);
  reject(new Error('offline'));
  await flush();
  expect(render().entries).toEqual([room('1'), room('3')]);
  expect(render().error).toBe('offline');
});
it('does not overwrite a newer broadcast with an older load response', async () => {
  let finish!: (value: ReturnType<typeof ok<SpecialFollowEntry[]>>) => void;
  load.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render();
  broadcast([room('3')]);
  finish(ok([room('1')]));
  await flush();
  expect(render().entries).toEqual([room('3')]);
});
