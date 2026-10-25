import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC } from '@shared/contracts/ipc';
import type { SpecialFollowEntry } from '@shared/contracts/specialFollow';
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

const entry: SpecialFollowEntry = {
  platform: 'douyu',
  roomId: '138243',
  name: '洞主',
  title: '洞主的直播间',
  addedAt: 10,
};

describe('special follow IPC', () => {
  const special = { load: vi.fn(), toggle: vi.fn() };

  beforeEach(() => {
    special.load.mockReset();
    special.toggle.mockReset();
    electron.handlers.clear();
    registerIpcHandlers({ special } as unknown as IpcServices);
  });

  it('loads pinned rooms', async () => {
    special.load.mockResolvedValue([entry]);
    expect(await electron.handlers.get(IPC.specialLoad)?.(null, undefined)).toEqual({
      ok: true,
      data: [entry],
    });
  });

  it('validates and toggles a pin', async () => {
    special.toggle.mockResolvedValue([]);
    expect(
      await electron.handlers.get(IPC.specialToggle)?.(null, {
        platform: 'douyu',
        roomId: ' 138243 ',
        name: '洞主',
        cover: 'https://rpic.douyucdn.cn/cover.avif',
      }),
    ).toEqual({ ok: true, data: [] });
    expect(special.toggle).toHaveBeenCalledWith({
      platform: 'douyu',
      roomId: '138243',
      name: '洞主',
      cover: 'https://rpic.douyucdn.cn/cover.avif',
    });
  });

  it('rejects malformed targets before touching the store', async () => {
    expect(
      await electron.handlers.get(IPC.specialToggle)?.(null, { platform: 'douyu', roomId: '' }),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect(special.toggle).not.toHaveBeenCalled();
  });
});
