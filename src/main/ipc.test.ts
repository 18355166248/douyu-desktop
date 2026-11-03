import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC } from '@shared/contracts/ipc';
import { MAX_SEARCH_KEYWORD_LENGTH } from '@shared/contracts/search';
import { AppError } from '@core/errors';
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

describe('room audience IPC', () => {
  const audience = vi.fn();
  const invoke = (input: unknown) => electron.handlers.get(IPC.streamsAudience)!(null, input);

  beforeEach(() => {
    audience.mockReset();
    electron.handlers.clear();
    registerIpcHandlers({ streams: { audience } } as unknown as IpcServices);
  });

  it('passes the validated platform and trimmed room ID and returns a result', async () => {
    const snapshot = { platform: 'douyu', roomId: '24422', metrics: [], fetchedAt: 42 };
    audience.mockResolvedValue(snapshot);
    expect(await invoke({ platform: 'douyu', roomId: ' 24422 ' })).toEqual({
      ok: true,
      data: snapshot,
    });
    expect(audience).toHaveBeenCalledWith({ platform: 'douyu', roomId: '24422' });
  });

  it.each([
    { platform: 'unknown', roomId: '123' },
    { platform: 'bilibili', roomId: '  ' },
    { platform: 'huya', roomId: 'x'.repeat(33) },
    { roomId: '123' },
    null,
  ])('rejects invalid renderer input without contacting a platform: %j', async (input) => {
    expect(await invoke(input)).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect(audience).not.toHaveBeenCalled();
  });

  it('returns a retryable network error without rejecting the IPC promise', async () => {
    audience.mockRejectedValue(new AppError('NETWORK', '请求超时', { retryable: true }));
    expect(await invoke({ platform: 'huya', roomId: '660000' })).toMatchObject({
      ok: false,
      error: { code: 'NETWORK', message: '请求超时', retryable: true },
    });
  });
});

describe('room PK IPC', () => {
  it('validates the room ID before accessing the gateway', async () => {
    const pk = vi.fn().mockResolvedValue(null);
    registerIpcHandlers({ streams: { pk } } as unknown as IpcServices);
    const invoke = (value: unknown) => electron.handlers.get(IPC.streamsPk)!(null, value);
    expect(await invoke('../1')).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect(pk).not.toHaveBeenCalled();
    expect(await invoke(' 4452132 ')).toEqual({ ok: true, data: null });
    expect(pk).toHaveBeenCalledWith('4452132');
  });
});

describe('room search IPC', () => {
  const rooms = vi.fn();
  const invoke = (input: unknown) => electron.handlers.get(IPC.searchRooms)!(null, input);

  beforeEach(() => {
    rooms.mockReset();
    electron.handlers.clear();
    registerIpcHandlers({ search: { rooms } } as unknown as IpcServices);
  });

  it('trims the keyword and echoes it back with the results', async () => {
    const items = [{ platform: 'douyu', roomId: '9999' }];
    rooms.mockResolvedValue(items);
    expect(await invoke({ query: '  旭旭宝宝 ' })).toEqual({
      ok: true,
      data: { query: '旭旭宝宝', items },
    });
    expect(rooms).toHaveBeenCalledWith('旭旭宝宝');
  });

  it.each([
    { query: '' },
    { query: '   ' },
    { query: 'x'.repeat(MAX_SEARCH_KEYWORD_LENGTH + 1) },
    {},
    null,
    '旭旭宝宝',
  ])('rejects invalid keywords without contacting Douyu: %j', async (input) => {
    expect(await invoke(input)).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect(rooms).not.toHaveBeenCalled();
  });
});
