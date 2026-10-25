import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JsonAccountStore, type AccountRecord } from './JsonAccountStore';

const fs = vi.hoisted(() => ({
  mkdir: vi.fn(),
  readFile: vi.fn(),
  rename: vi.fn(),
  writeFile: vi.fn(),
}));
vi.mock('node:fs/promises', () => fs);

const account = (id: string): AccountRecord => ({
  id,
  uid: id,
  nickname: id,
  avatarUrl: '',
  partition: `persist:${id}`,
  lastLoginAt: 1,
  status: 'active',
});

beforeEach(() => {
  vi.resetAllMocks();
  fs.readFile.mockRejectedValue(new Error('ENOENT'));
  fs.mkdir.mockResolvedValue(undefined);
  fs.writeFile.mockResolvedValue(undefined);
  fs.rename.mockResolvedValue(undefined);
});

describe('JsonAccountStore concurrency', () => {
  it('shares the initial read across concurrent callers', async () => {
    let finish!: (value: string) => void;
    fs.readFile.mockReturnValue(
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
    );
    const store = new JsonAccountStore('accounts.json');
    const records = store.list();
    const active = store.getActiveId();
    const completed = vi.fn();
    void active.then(completed);
    await Promise.resolve();
    expect(completed).not.toHaveBeenCalled();
    finish(JSON.stringify({ version: 1, activeId: 'a', accounts: [account('a')] }));
    expect(await active).toBe('a');
    expect(await records).toEqual([account('a')]);
    expect(fs.readFile).toHaveBeenCalledTimes(1);
  });

  it('serializes overlapping saves and persists the latest complete state', async () => {
    let release!: () => void;
    fs.rename.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const store = new JsonAccountStore('accounts.json');
    await store.list();
    const first = store.upsert(account('a'));
    await vi.waitFor(() => expect(fs.rename).toHaveBeenCalledTimes(1));
    const second = store.upsert(account('b'));
    const third = store.setActive('b');
    await Promise.resolve();
    await Promise.resolve();
    expect(fs.writeFile).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second, third]);
    const lastWrite = fs.writeFile.mock.calls.at(-1);
    expect(JSON.parse(String(lastWrite?.[1]))).toMatchObject({
      activeId: 'b',
      accounts: [account('a'), account('b')],
    });
    expect(fs.rename).toHaveBeenCalledTimes(3);
  });

  it('reports a failed save but allows later saves to succeed', async () => {
    fs.rename.mockRejectedValueOnce(new Error('disk error'));
    const store = new JsonAccountStore('accounts.json');
    await expect(store.upsert(account('a'))).rejects.toThrow('disk error');
    await expect(store.setActive('a')).resolves.toBeUndefined();
    expect(fs.rename).toHaveBeenCalledTimes(2);
  });
});
