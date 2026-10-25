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

const FANS_HTML = `
<tr data-fans-room="9999" data-fans-level="8">
  <td><a href="/9999" class="anchor--name">测试直播间</a></td>
</tr>
`;

function fakeJson(payload: unknown): {
  status: number;
  headers: Headers;
  text: () => Promise<string>;
} {
  return {
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => JSON.stringify(payload),
  };
}

function fakeHtml(html: string): {
  status: number;
  headers: Headers;
  text: () => Promise<string>;
} {
  return {
    status: 200,
    headers: new Headers({ 'content-type': 'text/html' }),
    text: async () => html,
  };
}

function createService(
  gate?: Promise<void>,
  healthStatus: 'active' | 'expired' = 'active',
): {
  service: TaskService;
  progress: TaskProgressEvent[];
} {
  const session = {
    fetch: async (url: string) => {
      if (gate) await gate;
      if (url.includes('/member/cp/getFansBadgeList')) return fakeHtml(FANS_HTML);
      if (url.includes('/japi/interactnc/web/fanshome/sign')) {
        return fakeJson({ error: 0, msg: '操作成功' });
      }
      return fakeJson({ error: 0 });
    },
  } as unknown as Session;

  const accounts = {
    getActiveId: async () => 'account-1',
    health: async () => ({ status: healthStatus, checkedAt: Date.now() }),
    getSession: async () => session,
    createAuthContext: async () => ({
      headers: async () => ({}),
      csrfToken: async () => '',
      fansCtn: async () => 'ctn',
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
    const result = await service.run({ taskId: 'douyu.fans-sign', dryRun: false }, (event) =>
      progress.push(event),
    );

    expect(result.status).toBe('success');
    expect(result.accountId).toBe('account-1');
    expect(result.dryRun).toBe(false);
    expect(progress).toHaveLength(1);
    expect(service.status()).toMatchObject({
      taskId: 'douyu.fans-sign',
      running: false,
      result: { status: 'success' },
    });
  });

  it('keeps dry runs attributable without treating them as real sign-ins', async () => {
    const { service, progress } = createService();
    const result = await service.run({ taskId: 'douyu.fans-sign', dryRun: true }, (event) =>
      progress.push(event),
    );
    expect(result).toMatchObject({ accountId: 'account-1', dryRun: true, status: 'success' });
    expect(progress).toHaveLength(0);
    expect(service.status()?.result).toEqual(result);
  });

  it('rejects a second run while the first is still active', async () => {
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { service } = createService(gate);

    const first = service.run({ taskId: 'douyu.fans-sign' });
    expect(service.status()?.running).toBe(true);
    await expect(service.run({ taskId: 'douyu.fans-sign' })).rejects.toMatchObject({
      code: 'BUSY',
    });

    release();
    await expect(first).resolves.toMatchObject({ status: 'success' });
    expect(service.status()?.running).toBe(false);
  });

  it('rejects the run when the login has expired', async () => {
    const { service } = createService(undefined, 'expired');
    await expect(service.run({ taskId: 'douyu.fans-sign' })).rejects.toMatchObject({
      code: 'AUTH_EXPIRED',
    });
    expect(service.status()?.running).toBe(false);
  });
});
