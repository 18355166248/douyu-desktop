import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JsonSpecialFollowStore } from './JsonSpecialFollowStore';

let directory = '';
let filePath = '';

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'douyu-special-'));
  filePath = join(directory, '.douyu-desktop', 'special-follows.json');
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('JsonSpecialFollowStore', () => {
  it('returns an empty list when the file does not exist', async () => {
    await expect(new JsonSpecialFollowStore(filePath).load()).resolves.toEqual([]);
  });

  it('pins a room and removes it when toggled again', async () => {
    const store = new JsonSpecialFollowStore(filePath);
    const pinned = await store.toggle({
      platform: 'douyu',
      roomId: '138243',
      name: '洞主',
      title: '洞主的直播间',
    });
    expect(pinned).toHaveLength(1);
    expect(pinned[0]).toMatchObject({
      platform: 'douyu',
      roomId: '138243',
      name: '洞主',
      title: '洞主的直播间',
    });

    await expect(new JsonSpecialFollowStore(filePath).load()).resolves.toEqual(pinned);
    const parsed = JSON.parse(await readFile(filePath, 'utf8')) as { version: number };
    expect(parsed.version).toBe(1);

    const unpinned = await store.toggle({ platform: 'douyu', roomId: '138243' });
    expect(unpinned).toEqual([]);
  });

  it('falls back to a room label when metadata is absent', async () => {
    const store = new JsonSpecialFollowStore(filePath);
    const pinned = await store.toggle({ platform: 'huya', roomId: '660000' });
    expect(pinned[0]).toMatchObject({ name: '房间 660000', title: '房间 660000' });
  });

  it('rejects malformed targets without writing', async () => {
    const store = new JsonSpecialFollowStore(filePath);
    await expect(store.toggle({ platform: 'douyu', roomId: '' })).rejects.toThrow();
    await expect(store.load()).resolves.toEqual([]);
  });
});
