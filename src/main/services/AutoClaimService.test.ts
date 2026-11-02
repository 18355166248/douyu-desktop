import type { Session } from 'electron';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_AUTO_CLAIM_SETTINGS } from '@shared/contracts/autoClaim';
import type { Logger } from '@core/ports/Logger';
import type { JsonAutoClaimStore } from '../adapters/storage/JsonAutoClaimStore';
import type { AccountSessionManager } from './AccountSessionManager';
import { AutoClaimService } from './AutoClaimService';
import type { RedPacketClaimApi } from './AutoClaimService';

const logger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const store = {
  load: async () => ({ ...DEFAULT_AUTO_CLAIM_SETTINGS, redPacket: true, intervalSec: 30 }),
  save: async (raw: unknown) => raw as { redPacket: boolean; intervalSec: number },
} as unknown as JsonAutoClaimStore;

function createAccounts(health: 'active' | 'expired' = 'active'): AccountSessionManager {
  return {
    getActiveId: async () => 'account-1',
    health: async () => ({ status: health, checkedAt: Date.now() }),
    getSession: async () => ({}) as unknown as Session,
    createAuthContext: async () => ({
      headers: async () => ({}),
      csrfToken: async () => '',
      fansCtn: async () => 'ctn',
    }),
  } as unknown as AccountSessionManager;
}

async function createService(
  api: {
    redPacketList: ReturnType<typeof vi.fn>;
    redPacketGrab: ReturnType<typeof vi.fn>;
  },
  health: 'active' | 'expired' = 'active',
): Promise<AutoClaimService> {
  const service = new AutoClaimService({
    accounts: createAccounts(health),
    logger,
    store,
    createApi: () => api as unknown as RedPacketClaimApi,
  });
  await service.init();
  service.setRooms(['9999']);
  return service;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('AutoClaimService', () => {
  it('grabs a fresh packet once and cools down afterwards', async () => {
    const api = {
      redPacketList: vi.fn(async () => [{ activityId: '7', startTime: 1_000 }]),
      redPacketGrab: vi.fn(async () => ({ status: 'claimed' as const, message: '40鱼丸' })),
    };
    const service = await createService(api);

    const first = await service.pollOnce();
    expect(first.events[0]).toMatchObject({ kind: 'claimed', roomId: '9999' });
    expect(api.redPacketGrab).toHaveBeenCalledTimes(1);
    expect(api.redPacketGrab).toHaveBeenCalledWith('ctn', '7');

    await service.pollOnce();
    expect(api.redPacketGrab).toHaveBeenCalledTimes(1);
    service.dispose();
  });

  it('retries while the platform reports isSuc=2', async () => {
    vi.useFakeTimers();
    const api = {
      redPacketList: vi.fn(async () => [{ activityId: '8', startTime: null }]),
      redPacketGrab: vi
        .fn()
        .mockResolvedValueOnce({ status: 'retry', message: '继续抢' })
        .mockResolvedValueOnce({ status: 'claimed', message: '10鱼丸' }),
    };
    const service = await createService(api);

    const pending = service.pollOnce();
    await vi.advanceTimersByTimeAsync(5_000);
    const state = await pending;

    expect(api.redPacketGrab).toHaveBeenCalledTimes(2);
    expect(state.events[0]).toMatchObject({ kind: 'claimed' });
    service.dispose();
  });

  it('records an empty packet and does not retry it', async () => {
    const api = {
      redPacketList: vi.fn(async () => [{ activityId: '9', startTime: null }]),
      redPacketGrab: vi.fn(async () => ({ status: 'none' as const, message: '已抢完' })),
    };
    const service = await createService(api);

    const state = await service.pollOnce();

    expect(state.events[0]).toMatchObject({ kind: 'empty' });
    expect(api.redPacketGrab).toHaveBeenCalledTimes(1);
    service.dispose();
  });

  it('stays idle when the switch is off', async () => {
    const api = { redPacketList: vi.fn(), redPacketGrab: vi.fn() };
    const service = new AutoClaimService({
      accounts: createAccounts(),
      logger,
      store: {
        load: async () => ({ ...DEFAULT_AUTO_CLAIM_SETTINGS, redPacket: false }),
        save: async (raw: unknown) => raw,
      } as unknown as JsonAutoClaimStore,
      createApi: () => api as unknown as RedPacketClaimApi,
    });
    await service.init();
    service.setRooms(['9999']);

    await service.pollOnce();

    expect(api.redPacketList).not.toHaveBeenCalled();
    service.dispose();
  });

  it('pauses and explains itself when the login expired', async () => {
    const api = { redPacketList: vi.fn(), redPacketGrab: vi.fn() };
    const service = await createService(api, 'expired');

    const state = await service.pollOnce();

    expect(api.redPacketList).not.toHaveBeenCalled();
    expect(state.events[0]).toMatchObject({ kind: 'info', message: expect.stringContaining('过期') });
    service.dispose();
  });

  it('keeps only numeric room ids, de-duplicated', async () => {
    const api = { redPacketList: vi.fn(), redPacketGrab: vi.fn() };
    const service = await createService(api);

    const state = service.setRooms(['9999', '9999', 'abc', '', 42, ' 777 ']);

    expect(state.rooms).toEqual(['9999', '777']);
    service.dispose();
  });
});
