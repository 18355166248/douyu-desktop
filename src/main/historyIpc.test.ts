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
  const history = { load: vi.fn(), save: vi.fn() };

  beforeEach(() => {
    history.load.mockReset();
    history.save.mockReset();
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

  it('passes renderer history through to the global store and returns normalized data', async () => {
    history.save.mockResolvedValue([entry]);

    expect(await electron.handlers.get(IPC.historySave)?.(null, [entry])).toEqual({
      ok: true,
      data: [entry],
    });
    expect(history.save).toHaveBeenCalledWith([entry]);
  });
});
