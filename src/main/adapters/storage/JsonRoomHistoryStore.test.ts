import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RoomHistoryEntry } from '@shared/contracts/history';
import { JsonRoomHistoryStore } from './JsonRoomHistoryStore';

const entry = (roomId: string, visitedAt: number, title = `房间 ${roomId}`): RoomHistoryEntry => ({
  platform: 'douyu',
  roomId,
  title,
  anchorName: '主播',
  visitedAt,
});

let directory = '';
let historyPath = '';

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'douyu-history-'));
  historyPath = join(directory, '.douyu-desktop', 'room-history.json');
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('JsonRoomHistoryStore', () => {
  it('returns an empty list when the global file does not exist yet', async () => {
    await expect(new JsonRoomHistoryStore(historyPath).load()).resolves.toEqual([]);
  });

  it('saves normalized entries to the global file and reads them back', async () => {
    const store = new JsonRoomHistoryStore(historyPath);
    const saved = await store.save([
      entry('222', 20, '旧标题'),
      entry('111', 30),
      entry('222', 40, '新标题'),
      entry('333', 10),
    ]);

    expect(saved.map((item) => item.roomId)).toEqual(['222', '111', '333']);
    expect(saved[0]?.title).toBe('新标题');
    await expect(new JsonRoomHistoryStore(historyPath).load()).resolves.toEqual(saved);

    const parsed = JSON.parse(await readFile(historyPath, 'utf8')) as {
      version: number;
      entries: RoomHistoryEntry[];
    };
    expect(parsed.version).toBe(1);
    expect(parsed.entries).toEqual(saved);
  });

  it('rejects invalid renderer data without writing a global file', async () => {
    const store = new JsonRoomHistoryStore(historyPath);

    await expect(store.save([{ ...entry('111', 10), roomId: '' }] as unknown)).rejects.toThrow();
    await expect(store.load()).resolves.toEqual([]);
  });

  it('rejects a renderer list larger than the shared maximum', async () => {
    const store = new JsonRoomHistoryStore(historyPath);

    await expect(
      store.save(Array.from({ length: 35 }, (_, index) => entry(String(index + 1), index + 1))),
    ).rejects.toThrow();
    await expect(store.load()).resolves.toEqual([]);
  });
});
