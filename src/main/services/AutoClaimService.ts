import type { Session } from 'electron';
import {
  AUTO_CLAIM_EVENT_LIMIT,
  DEFAULT_AUTO_CLAIM_SETTINGS,
  MAX_AUTO_CLAIM_ROOMS,
} from '@shared/contracts/autoClaim';
import type { AutoClaimEvent, AutoClaimEventKind, AutoClaimState } from '@shared/contracts/autoClaim';
import type { RedPacketItem } from '@core/douyu/api/DouyuClaimApi';
import { DouyuClaimApi } from '@core/douyu/api/DouyuClaimApi';
import type { DouyuAuthContext } from '@core/douyu/auth/DouyuAuthContext';
import { DouyuHttpClient } from '@core/http/DouyuHttpClient';
import type { Logger } from '@core/ports/Logger';
import { sleep } from '@core/tasks/sleep';
import { CHROME_UA } from '../constants';
import { SessionHttpClient } from '../adapters/electron/SessionHttpClient';
import type { JsonAutoClaimStore } from '../adapters/storage/JsonAutoClaimStore';
import type { AccountSessionManager } from './AccountSessionManager';

/** 红包接口的最小面，便于测试替换真实实现。 */
export interface RedPacketClaimApi {
  redPacketList(roomId: string, signal?: AbortSignal): Promise<RedPacketItem[]>;
  redPacketGrab(
    ctn: string,
    activityId: string,
    signal?: AbortSignal,
  ): Promise<{ status: 'claimed' | 'retry' | 'none'; message: string }>;
}

export interface AutoClaimDeps {
  accounts: AccountSessionManager;
  logger: Logger;
  store: JsonAutoClaimStore;
  createApi?: (session: Session, auth: DouyuAuthContext) => RedPacketClaimApi;
}

/** 开抢前提前量：斗鱼在开抢瞬间就判定，早 2 秒最稳。 */
const GRAB_LEAD_MS = 2_000;
/** 单次等待上限，避免红包开始时间异常时把轮询卡死。 */
const MAX_WAIT_MS = 15_000;
const GRAB_ATTEMPTS = 3;
const GRAB_RETRY_DELAY_MS = 1_200;
/** 同一个红包的冷却时间，避免反复请求已经抢完的活动。 */
const CLAIM_COOLDOWN_MS = 10 * 60_000;

/**
 * 后台自动抢「直播间礼物红包」。
 *
 * 只做完全走 HTTP 的那部分：列表接口给出 activityid 与开始时间，开抢接口
 * 返回 `isSuc=2` 时表示还没抢完、需要继续抢。宝箱需要直播间 socket 的
 * tsboxb 指令与极验，不在本服务范围内。
 */
export class AutoClaimService {
  private settings = DEFAULT_AUTO_CLAIM_SETTINGS;
  private rooms: string[] = [];
  private events: AutoClaimEvent[] = [];
  private lastPollAt: number | null = null;
  private polling = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listener: ((state: AutoClaimState) => void) | null = null;
  private readonly claimedAt = new Map<string, number>();
  private disposed = false;

  constructor(private readonly deps: AutoClaimDeps) {}

  async init(): Promise<void> {
    this.settings = await this.deps.store.load();
    this.schedule();
  }

  onChange(listener: (state: AutoClaimState) => void): () => void {
    this.listener = listener;
    return () => {
      if (this.listener === listener) this.listener = null;
    };
  }

  snapshot(): AutoClaimState {
    return {
      settings: { ...this.settings },
      rooms: [...this.rooms],
      polling: this.polling,
      lastPollAt: this.lastPollAt,
      events: [...this.events],
    };
  }

  async setSettings(raw: unknown): Promise<AutoClaimState> {
    this.settings = await this.deps.store.save(raw);
    this.schedule();
    this.publish();
    return this.snapshot();
  }

  /** 渲染进程上报当前打开着的斗鱼直播间。 */
  setRooms(rawRoomIds: readonly unknown[]): AutoClaimState {
    const rooms: string[] = [];
    for (const value of rawRoomIds) {
      const roomId = typeof value === 'string' ? value.trim() : '';
      if (!/^\d{1,16}$/.test(roomId)) continue;
      if (rooms.includes(roomId)) continue;
      rooms.push(roomId);
      if (rooms.length >= MAX_AUTO_CLAIM_ROOMS) break;
    }
    this.rooms = rooms;
    this.schedule();
    this.publish();
    return this.snapshot();
  }

  /** 手动触发一次轮询（面板上的「立即检查」）。 */
  async pollOnce(): Promise<AutoClaimState> {
    await this.poll();
    return this.snapshot();
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private schedule(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.disposed) return;
    if (!this.settings.redPacket || this.rooms.length === 0) return;

    this.timer = setTimeout(
      () => {
        this.timer = null;
        void this.poll().finally(() => this.schedule());
      },
      Math.max(this.settings.intervalSec, 5) * 1_000,
    );
    this.timer.unref?.();
  }

  private async poll(): Promise<void> {
    if (this.disposed || this.polling) return;
    if (!this.settings.redPacket || this.rooms.length === 0) return;

    this.polling = true;
    this.publish();
    try {
      const built = await this.buildApi();
      if (!built.ok) {
        this.record('info', '', built.reason);
        return;
      }
      const { ctn, client } = built;
      for (const roomId of this.rooms) {
        if (this.disposed) break;
        await this.pollRoom(client, ctn, roomId);
      }
      this.lastPollAt = Date.now();
    } catch (error) {
      this.deps.logger.warn('auto-claim.poll-failed', {
        message: error instanceof Error ? error.message : String(error),
      });
      this.record('error', '', '自动抢红包轮询失败');
    } finally {
      this.polling = false;
      this.publish();
    }
  }

  private async buildApi(): Promise<
    { ok: true; client: RedPacketClaimApi; ctn: string } | { ok: false; reason: string }
  > {
    const accountId = await this.deps.accounts.getActiveId();
    if (!accountId) {
      return { ok: false, reason: '没有可用的斗鱼登录，自动抢红包已暂停' };
    }
    const health = await this.deps.accounts.health(accountId);
    if (health.status !== 'active') {
      return { ok: false, reason: '斗鱼登录已过期，自动抢红包已暂停' };
    }

    const session = await this.deps.accounts.getSession(accountId);
    const auth = await this.deps.accounts.createAuthContext(accountId);
    const client =
      this.deps.createApi?.(session, auth) ??
      new DouyuClaimApi(new DouyuHttpClient(new SessionHttpClient(session, CHROME_UA)), auth);
    const ctn = await auth.fansCtn();
    if (!ctn) return { ok: false, reason: '无法获取领取凭证，自动抢红包已暂停' };
    return { ok: true, client, ctn };
  }

  private async pollRoom(client: RedPacketClaimApi, ctn: string, roomId: string): Promise<void> {
    let items: RedPacketItem[];
    try {
      items = await client.redPacketList(roomId);
    } catch (error) {
      this.deps.logger.warn('auto-claim.list-failed', {
        roomId,
        message: error instanceof Error ? error.message : String(error),
      });
      this.record('error', roomId, '红包列表获取失败');
      return;
    }

    for (const item of items) {
      if (this.disposed) return;
      if (this.isCoolingDown(item.activityId)) continue;

      const wait = waitBefore(item.startTime);
      if (wait > 0) {
        try {
          await sleep(wait);
        } catch {
          return;
        }
      }

      const outcome = await this.grab(client, ctn, item.activityId, roomId);
      if (outcome === 'error') continue;
    }
  }

  private async grab(
    client: RedPacketClaimApi,
    ctn: string,
    activityId: string,
    roomId: string,
  ): Promise<'done' | 'error'> {
    for (let attempt = 1; attempt <= GRAB_ATTEMPTS; attempt += 1) {
      try {
        const result = await client.redPacketGrab(ctn, activityId);
        if (result.status === 'retry') {
          if (attempt < GRAB_ATTEMPTS) await sleep(GRAB_RETRY_DELAY_MS);
          continue;
        }
        this.claimedAt.set(activityId, Date.now());
        this.record(
          result.status === 'claimed' ? 'claimed' : 'empty',
          roomId,
          result.status === 'claimed' ? `抢到红包：${result.message}` : '红包已抢完',
        );
        return 'done';
      } catch (error) {
        this.deps.logger.warn('auto-claim.grab-failed', {
          roomId,
          activityId,
          message: error instanceof Error ? error.message : String(error),
        });
        if (attempt >= GRAB_ATTEMPTS) {
          this.claimedAt.set(activityId, Date.now());
          this.record('error', roomId, '红包领取失败');
          return 'error';
        }
        await sleep(GRAB_RETRY_DELAY_MS);
      }
    }
    return 'done';
  }

  private isCoolingDown(activityId: string): boolean {
    const at = this.claimedAt.get(activityId);
    if (at === undefined) return false;
    if (Date.now() - at < CLAIM_COOLDOWN_MS) return true;
    this.claimedAt.delete(activityId);
    return false;
  }

  private record(kind: AutoClaimEventKind, roomId: string, message: string): void {
    this.events = [{ at: Date.now(), roomId, kind, message }, ...this.events].slice(
      0,
      AUTO_CLAIM_EVENT_LIMIT,
    );
    this.publish();
  }

  private publish(): void {
    this.listener?.(this.snapshot());
  }
}

function waitBefore(startTime: number | null): number {
  if (startTime === null) return 0;
  const delay = startTime - GRAB_LEAD_MS - Date.now();
  if (delay <= 0) return 0;
  return Math.min(delay, MAX_WAIT_MS);
}
