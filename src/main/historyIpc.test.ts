import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC } from '@shared/contracts/ipc';
import type { RoomHistoryEntry } from '@shared/contracts/history';
import { registerIpcHandlers, type IpcServices } from './ipc';

const electron = vi.hoisted(() => ({
  handlers: new Map<string, (_event: unknown, input: unknown) => unknown>(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    on: vi.fn(),
    handle: (channel: string, handler: (_event: unknown, input: unknown) => unknown) =>
      electron.handlers.set(channel, handler),
  },
  BrowserWindow: { getAllWindows: () => [] },
  shell: { openExternal: vi.fn() },
}));

const entry: RoomHistoryEntry = {
  platform: 'douyu',
  roomId: '111',
  title: '标题',
  anchorName: '主播',
  visitedAt: 1,
};

describe('room history IPC', () => {
  const history = { load: vi.fn(), merge: vi.fn(), remove: vi.fn(), clear: vi.fn() };

  beforeEach(() => {
    history.load.mockReset();
    history.merge.mockReset();
    history.remove.mockReset();
    history.clear.mockReset();
    electron.handlers.clear();
    registerIpcHandlers({ history } as unknown as IpcServices);
  });

  it('returns the global history file contents', async () => {
    history.load.mockResolvedValue([entry]);

    expect(await electron.handlers.get(IPC.historyLoad)?.(null, undefined)).toEqual({
      ok: true,
      data: [entry],
    });
  });

  it('merges renderer history through the global store and returns normalized data', async () => {
    history.merge.mockResolvedValue([entry]);

    expect(await electron.handlers.get(IPC.historyMerge)?.(null, [entry])).toEqual({
      ok: true,
      data: [entry],
    });
    expect(history.merge).toHaveBeenCalledWith([entry]);
  });

  it('removes validated room keys through the global store', async () => {
    history.remove.mockResolvedValue([]);

    expect(await electron.handlers.get(IPC.historyRemove)?.(null, ['douyu:111'])).toEqual({
      ok: true,
      data: [],
    });
    expect(history.remove).toHaveBeenCalledWith(['douyu:111']);
  });

  it('rejects malformed history keys before touching the store', async () => {
    expect(await electron.handlers.get(IPC.historyRemove)?.(null, ['111'])).toMatchObject({
      ok: false,
      error: { code: 'INVALID_INPUT' },
    });
    expect(history.remove).not.toHaveBeenCalled();
  });

  it('clears the global history', async () => {
    history.clear.mockResolvedValue([]);

    expect(await electron.handlers.get(IPC.historyClear)?.(null, undefined)).toEqual({
      ok: true,
      data: [],
    });
  });
});
