import md5 from 'blueimp-md5';
import { parseDouyuPk } from '@shared/douyu/pkProtocol';
import type { RoomPkSnapshot } from '@shared/contracts/pk';
import type {
  RoomAudienceMetric,
  RoomAudienceRanking,
  RoomAudienceSnapshot,
} from '@shared/contracts/audience';
import { DOUYU_AUDIENCE_SUBSCRIPTIONS, parseDouyuAudience } from '@shared/douyu/audienceProtocol';
import { decodeDouyuPackets, encodeDouyuPacket } from '@shared/douyu/danmakuProtocol';
import { AppError } from '../../errors';
import type { HttpClient } from '../../ports/HttpClient';

const SNAPSHOT_TIMEOUT_MS = 8_000;
const SNAPSHOT_SETTLE_MS = 1_200;
const LOGIN_SALT = "r5*^5;}2#${XF[h+;'./.Q'1;,-]f'p[";
const GATEWAY_PORTS = new Set([6671, 6672, 6673, 6674, 6675]);
const RANK_ORDER: RoomAudienceRanking['key'][] = ['day', 'week', 'total'];

interface GatewayResponse {
  error?: number | string;
  data?: { wss?: unknown };
}

type SocketFactory = (url: string) => WebSocket;

function gatewayUrl(payload: GatewayResponse): string {
  const servers = payload?.data?.wss;
  if (Number(payload?.error) !== 0 || !Array.isArray(servers)) {
    throw new AppError('UPSTREAM', '斗鱼房间数据连接地址暂不可用');
  }
  for (const server of servers as unknown[]) {
    if (!server || typeof server !== 'object') continue;
    const { domain, port } = server as Record<string, unknown>;
    if (domain !== 'wsproxy.douyu.com') continue;
    if (typeof port !== 'number' && (typeof port !== 'string' || !/^\d+$/.test(port))) continue;
    const numericPort = Number(port);
    if (GATEWAY_PORTS.has(numericPort)) return `wss://wsproxy.douyu.com:${numericPort}/`;
  }
  throw new AppError('UPSTREAM', '斗鱼未返回受支持的房间数据连接地址');
}

function stt(data: Record<string, string | number>): string {
  return Object.entries(data)
    .map(([key, value]) => `${key}@=${String(value).replace(/@/g, '@A').replace(/\//g, '@S')}/`)
    .join('');
}

function anonymousLogin(roomId: string): string {
  const rt = Math.floor(Date.now() / 1000);
  const devid = globalThis.crypto.randomUUID().replace(/-/g, '');
  return stt({
    type: 'loginreq',
    roomid: roomId,
    dfl: '',
    username: '',
    password: '',
    ltkid: '',
    biz: '',
    stk: '',
    devid,
    ct: 0,
    pt: 2,
    cvr: 0,
    tvr: 7,
    apd: '',
    jwt: '',
    rt,
    vk: md5(`${rt}${LOGIN_SALT}${devid}`),
    ver: '20220825',
    aver: '218101901',
    dmbt: 'chrome',
    dmbv: '130',
  });
}

function unavailableMetric(key: 'vip' | 'diamond-fans'): RoomAudienceMetric {
  return {
    key,
    label: key === 'vip' ? '贵宾' : '钻石粉丝',
    value: null,
    unit: '人',
    description: '本次暂未收到该项数据。',
  };
}

export class DouyuAudienceResolver {
  constructor(
    private readonly http: HttpClient,
    private readonly socketFactory: SocketFactory = (url) => new WebSocket(url),
  ) {}

  async resolve(
    roomId: string,
    signal?: AbortSignal,
    includePk = false,
  ): Promise<RoomAudienceSnapshot> {
    const normalizedRoomId = roomId.trim();
    if (!normalizedRoomId) throw new AppError('INVALID_INPUT', '请输入斗鱼房间号');
    signal?.throwIfAborted();

    const controller = new AbortController();
    const onAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', onAbort, { once: true });
    const timeout = setTimeout(
      () => controller.abort(new AppError('UPSTREAM', '斗鱼房间数据获取超时', { retryable: true })),
      SNAPSHOT_TIMEOUT_MS,
    );
    try {
      const response = await this.http.request({
        url: `https://www.douyu.com/lapi/live/gateway/web/${encodeURIComponent(normalizedRoomId)}?isH5=1`,
        method: 'POST',
        headers: { Referer: `https://www.douyu.com/${encodeURIComponent(normalizedRoomId)}` },
        signal: controller.signal,
        timeoutMs: 5_000,
        retry: 'safe',
      });
      if (response.status !== 200) throw new AppError('UPSTREAM', '斗鱼房间数据连接失败');
      const payload = await response.json<GatewayResponse>();
      controller.signal.throwIfAborted();
      return await this.readSnapshot(
        gatewayUrl(payload),
        normalizedRoomId,
        controller.signal,
        signal,
        includePk,
      );
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      if (controller.signal.aborted) throw controller.signal.reason;
      throw error;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  private readSnapshot(
    url: string,
    roomId: string,
    signal: AbortSignal,
    callerSignal?: AbortSignal,
    includePk = false,
  ): Promise<RoomAudienceSnapshot> {
    return new Promise((resolve, reject) => {
      const metrics = new Map<string, RoomAudienceMetric>();
      const rankings = new Map<RoomAudienceRanking['key'], RoomAudienceRanking>();
      let socket: WebSocket | undefined;
      let settled = false;
      let requested = false;
      let pk: RoomPkSnapshot | null = null;
      let settleTimer: ReturnType<typeof setTimeout> | undefined;

      const clearSettleTimer = () => {
        if (settleTimer === undefined) return;
        clearTimeout(settleTimer);
        settleTimer = undefined;
      };

      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        clearSettleTimer();
        signal.removeEventListener('abort', onAbort);
        if (socket) {
          socket.removeEventListener('open', onOpen);
          socket.removeEventListener('message', onMessage);
          socket.removeEventListener('error', onError);
          socket.removeEventListener('close', onClose);
          try {
            socket.close();
          } catch {
            // Closing an already disconnected socket must not lose a snapshot.
          }
        }
        if (callerSignal?.aborted) {
          reject(callerSignal.reason);
        } else if (metrics.size || rankings.size || pk) {
          resolve({
            platform: 'douyu',
            roomId,
            metrics: [
              metrics.get('vip') ?? unavailableMetric('vip'),
              metrics.get('diamond-fans') ?? unavailableMetric('diamond-fans'),
            ],
            rankings: RANK_ORDER.flatMap((key) => {
              const ranking = rankings.get(key);
              return ranking ? [ranking] : [];
            }),
            fetchedAt: Date.now(),
            ...(pk ? { pk } : {}),
          });
        } else {
          reject(error ?? new AppError('UPSTREAM', '斗鱼暂未返回房间数据', { retryable: true }));
        }
      };
      const send = (payload: string) => socket?.send(encodeDouyuPacket(payload));
      const armSettleTimer = () => {
        clearSettleTimer();
        settleTimer = setTimeout(() => finish(), SNAPSHOT_SETTLE_MS);
      };
      const onAbort = () => finish(signal.reason);
      const onError = () =>
        finish(new AppError('UPSTREAM', '斗鱼房间数据连接失败', { retryable: true }));
      const onClose = () => finish();
      const onOpen = () => {
        try {
          send(anonymousLogin(roomId));
        } catch (error) {
          finish(error);
        }
      };
      const onMessage = (event: MessageEvent) => {
        try {
          const data: unknown = event.data;
          let packets: string[];
          if (typeof data === 'string') packets = [data];
          else if (data instanceof ArrayBuffer) packets = decodeDouyuPackets(new Uint8Array(data));
          else if (ArrayBuffer.isView(data)) {
            packets = decodeDouyuPackets(
              new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
            );
          } else return;

          for (const packet of packets) {
            if (settled) break;
            if (packet.startsWith('type@=loginres/') && !requested) {
              requested = true;
              // Initial data belongs on the gateway. Periodic polling uses a
              // fresh short-lived connection, so barrage subscriptions aren't needed.
              for (const request of DOUYU_AUDIENCE_SUBSCRIPTIONS) {
                if (request.startsWith('type@=get/')) send(request);
              }
              send(stt({ type: 'keeplive', tick: Math.floor(Date.now() / 1000) }));
            } else if (packet.startsWith('type@=error/')) {
              onError();
              break;
            }
            const update = parseDouyuAudience(packet, roomId);
            if (includePk) {
              pk = parseDouyuPk(packet, roomId) ?? pk;
              if (pk) {
                finish();
                break;
              }
            }
            for (const metric of update?.metrics ?? []) metrics.set(metric.key, metric);
            if (update?.ranking) rankings.set(update.ranking.key, update.ranking);
            if (!includePk && metrics.size === 2 && rankings.size === 3) {
              finish();
              break;
            }
            // Some rooms legitimately omit a counter (for example 贵宾). Once
            // at least one value arrived, don't make the UI wait for the full
            // timeout just to establish that the missing value is absent.
            if (update && (update.metrics?.length || update.ranking)) armSettleTimer();
          }
        } catch (error) {
          finish(error);
        }
      };

      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) {
        finish(signal.reason);
        return;
      }
      try {
        socket = this.socketFactory(url);
        socket.binaryType = 'arraybuffer';
        socket.addEventListener('open', onOpen);
        socket.addEventListener('message', onMessage);
        socket.addEventListener('error', onError);
        socket.addEventListener('close', onClose);
      } catch (error) {
        finish(error);
      }
    });
  }
}
