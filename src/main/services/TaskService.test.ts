import type { Session } from 'electron';
import { describe, expect, it } from 'vitest';
import type { Logger } from '@core/ports/Logger';
import type { TaskProgressEvent } from '@shared/contracts/task';
import type { AccountSessionManager } from './AccountSessionManager';
import { TaskService } from './TaskService';

const logger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function fakeJson(payload: unknown): { status: number; headers: Headers; text: () => Promise<string> } {
  return {
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => JSON.stringify(payload),
  };
}

function createService(
  gate?: Promise<void>,
): { service: TaskService; progress: TaskProgressEvent[] } {
  const session = {
    fetch: async (url: string) => {
      if (gate) await gate;
      if (url.includes('/follow/list')) {
        return fakeJson({
          error: 0,
          data: {
            pageCount: 1,
            list: [{ room_id: 9999, room_name: '测试直播间', show_status: 1 }],
          },
        });
      }
      return fakeJson({ error: 0 });
    },
  } as unknown as Session;

  const accounts = {
    getActiveId: async () => 'account-1',
    getSession: async () => session,
    createAuthContext: async () => ({
      headers: async () => ({}),
      csrfToken: async () => '',
    }),
  } as unknown as AccountSessionManager;

  const progress: TaskProgressEvent[] = [];
  return {
    service: new TaskService(accounts, logger),
    progress,
  };
}

describe('TaskService background run state', () => {
  it('keeps a snapshot after a completed run', async () => {
    const { service, progress } = createService();
    const result = await service.run(
      { taskId: 'douyu.room-sign', options: { liveOnly: true }, dryRun: false },
      (event) => progress.push(event),
    );

    expect(result.status).toBe('success');
    expect(progress).toHaveLength(1);
    expect(service.status()).toMatchObject({
      taskId: 'douyu.room-sign',
      running: false,
      result: { status: 'success' },
    });
  });

  it('rejects a second run while the first is still active', async () => {
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { service } = createService(gate);

    const first = service.run({ taskId: 'douyu.room-sign' });
    expect(service.status()?.running).toBe(true);
    await expect(service.run({ taskId: 'douyu.room-sign' })).rejects.toMatchObject({
      code: 'BUSY',
    });

    release();
    await expect(first).resolves.toMatchObject({ status: 'success' });
    expect(service.status()?.running).toBe(false);
  });
});
