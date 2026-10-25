import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeDouyuPackets, encodeDouyuPacket } from '@shared/douyu/danmakuProtocol';
import type { HttpClient, HttpRequest, HttpResponse } from '../../ports/HttpClient';
import { DouyuAudienceResolver } from './DouyuAudienceResolver';

const gateway = { error: 0, data: { wss: [{ domain: 'wsproxy.douyu.com', port: 6671 }] } };
const rankRow =
  'uid@AA=42@AScrk@AA=1@ASnickname@AA=榜单用户@ASgold@AA=12345@ASicon@AA=avatar_v3@AAS202610@AASimage@AS@S';

function jsonResponse(data: unknown): HttpResponse {
  return {
    status: 200,
    headers: {},
    text: async () => JSON.stringify(data),
    json: async <T>() => data as T,
  };
}

class FakeSocket {
  binaryType = 'blob';
  readyState = 0;
  listeners = new Map<string, Set<(event: { data?: unknown }) => void>>();
  sent: string[] = [];
  addEventListener = vi.fn((type: string, listener: (event: { data?: unknown }) => void) => {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)?.add(listener);
  });
  removeEventListener = vi.fn((type: string, listener: (event: { data?: unknown }) => void) => {
    this.listeners.get(type)?.delete(listener);
  });
  send = vi.fn((data: Uint8Array) => this.sent.push(...decodeDouyuPackets(data)));
  close = vi.fn(() => {
    this.readyState = 3;
    this.emit('close');
  });
  emit(type: string, event: { data?: unknown } = {}) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }
  open() {
    this.readyState = 1;
    this.emit('open');
  }
  message(...payloads: string[]) {
    const packets = payloads.map(encodeDouyuPacket);
    const data = new Uint8Array(packets.reduce((length, packet) => length + packet.length, 0));
    let offset = 0;
    for (const packet of packets) {
      data.set(packet, offset);
      offset += packet.length;
    }
    this.emit('message', { data: data.buffer });
  }
  get listenerCount() {
    return [...this.listeners.values()].reduce((count, listeners) => count + listeners.size, 0);
  }
}

function setup(payload: unknown = gateway) {
  const request = vi.fn(async (_request: HttpRequest) => jsonResponse(payload));
  const socket = new FakeSocket();
  const factory = vi.fn((_url: string) => socket as unknown as WebSocket);
  return { request, socket, factory, resolver: new DouyuAudienceResolver({ request }, factory) };
}

function expectClean(socket: FakeSocket) {
  expect(socket.close).toHaveBeenCalledTimes(1);
  expect(socket.listenerCount).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
}

describe('DouyuAudienceResolver', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('logs in anonymously, requests gateway snapshots and closes after all five updates', async () => {
    const { resolver, request, socket, factory } = setup();
    const controller = new AbortController();
    const removeAbortListener = vi.spyOn(controller.signal, 'removeEventListener');
    const pending = resolver.resolve(' 24422 ', controller.signal);
    await vi.advanceTimersByTimeAsync(0);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://www.douyu.com/lapi/live/gateway/web/24422?isH5=1',
        method: 'POST',
        headers: { Referer: 'https://www.douyu.com/24422' },
        timeoutMs: 5000,
      }),
    );
    expect(factory).toHaveBeenCalledWith('wss://wsproxy.douyu.com:6671/');
    expect(socket.binaryType).toBe('arraybuffer');
    socket.open();
    expect(socket.sent).toHaveLength(1);
    expect(socket.sent[0]).toContain('type@=loginreq/roomid@=24422/');
    expect(socket.sent[0]).toContain('username@=/password@=/');
    expect(socket.sent[0]).toMatch(/vk@=[a-f0-9]{32}\//);
    socket.message('type@=loginres/');
    expect(socket.sent.filter((message) => message.startsWith('type@=get/'))).toEqual([
      'type@=get/msgtype@=oni/',
      'type@=get/msgtype@=dfnum/',
      'type@=get/msgtype@=dayrk/',
      'type@=get/msgtype@=weekrk/',
      'type@=get/msgtype@=totalrk/',
    ]);
    expect(socket.sent.some((message) => message.startsWith('type@=sub/'))).toBe(false);
    socket.message('type@=loginres/');
    expect(socket.sent.filter((message) => message.startsWith('type@=get/'))).toHaveLength(5);
    socket.message(
      'type@=oni/rid@=24422/un@=8128/vn@=9000/',
      'type@=dfnum/rid@=24422/dfc@=49/',
      `type@=totalrk/rid@=24422/list@=${rankRow}/`,
      `type@=weekrk/rid@=24422/list@=${rankRow}/`,
      `type@=dayrk/rid@=24422/list@=${rankRow}/`,
    );
    const result = await pending;
    expect(result.metrics).toEqual([
      expect.objectContaining({ key: 'vip', value: 8128 }),
      expect.objectContaining({ key: 'diamond-fans', value: 49 }),
    ]);
    expect(result.rankings?.map((ranking) => ranking.key)).toEqual(['day', 'week', 'total']);
    expect(result.rankings?.[0]?.entries).toEqual([
      { rank: 1, userId: '42', nickname: '榜单用户', contribution: 123.45 },
    ]);
    expect(removeAbortListener).toHaveBeenCalledWith('abort', expect.any(Function));
    expectClean(socket);
  });

  it('returns valid partial data after the settle window, leaving missing values unknown', async () => {
    const { resolver, socket } = setup();
    const pending = resolver.resolve('24422');
    await vi.advanceTimersByTimeAsync(0);
    socket.open();
    socket.message('type@=oni/un@=0/');
    await vi.advanceTimersByTimeAsync(1_200);
    const result = await pending;
    expect(result.metrics).toEqual([
      expect.objectContaining({ key: 'vip', value: 0 }),
      expect.objectContaining({ key: 'diamond-fans', value: null }),
    ]);
    expect(result.rankings).toEqual([]);
    expectClean(socket);
  });

  it('keeps a confirmed empty ranking in a partial snapshot', async () => {
    const { resolver, socket } = setup();
    const pending = resolver.resolve('24422');
    await vi.advanceTimersByTimeAsync(0);
    socket.message('type@=dayrk/list@=/');
    await vi.advanceTimersByTimeAsync(1_200);
    expect((await pending).rankings).toEqual([
      expect.objectContaining({ key: 'day', entries: [] }),
    ]);
    expectClean(socket);
  });

  it('rejects a completely empty timeout instead of replacing usable cached data', async () => {
    const { resolver, socket } = setup();
    const pending = resolver.resolve('24422');
    const rejected = expect(pending).rejects.toMatchObject({ code: 'UPSTREAM' });
    await vi.advanceTimersByTimeAsync(0);
    socket.message('type@=oni/un@=broken/', 'type@=dayrk/list@=broken/');
    await vi.advanceTimersByTimeAsync(8000);
    await rejected;
    expectClean(socket);
  });

  it.each([
    null,
    { error: 1, data: gateway.data },
    { error: 0, data: { wss: [] } },
    { error: 0, data: { wss: [{ domain: 'evil.example', port: 6671 }] } },
    { error: 0, data: { wss: [{ domain: 'wsproxy.douyu.com.evil.example', port: 6671 }] } },
    { error: 0, data: { wss: [{ domain: 'wsproxy.douyu.com', port: 443 }] } },
    { error: 0, data: { wss: [{ domain: 'wsproxy.douyu.com', port: true }] } },
  ])(
    'rejects an invalid gateway response without opening an arbitrary socket: %j',
    async (payload) => {
      const { resolver, factory } = setup(payload);
      await expect(resolver.resolve('24422')).rejects.toMatchObject({ code: 'UPSTREAM' });
      expect(factory).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('selects only a valid allowlisted gateway from mixed server entries', async () => {
    const { resolver, socket, factory } = setup({
      error: '0',
      data: { wss: [null, {}, { domain: 'wsproxy.douyu.com', port: '6675' }] },
    });
    const pending = resolver.resolve('24422');
    const rejected = expect(pending).rejects.toMatchObject({ code: 'UPSTREAM' });
    await vi.advanceTimersByTimeAsync(0);
    expect(factory).toHaveBeenCalledWith('wss://wsproxy.douyu.com:6675/');
    socket.emit('error');
    await rejected;
    expectClean(socket);
  });

  it('rejects cancellation even when partial data has already arrived', async () => {
    const { resolver, socket } = setup();
    const controller = new AbortController();
    const reason = new Error('room removed');
    const pending = resolver.resolve('24422', controller.signal);
    const rejected = expect(pending).rejects.toBe(reason);
    await vi.advanceTimersByTimeAsync(0);
    socket.message('type@=oni/un@=1/');
    controller.abort(reason);
    await rejected;
    expectClean(socket);
  });

  it('passes cancellation to discovery and never opens a socket afterwards', async () => {
    const controller = new AbortController();
    const http: HttpClient = {
      request: ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
    };
    const factory = vi.fn();
    const pending = new DouyuAudienceResolver(http, factory).resolve('24422', controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    expect(factory).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['close', 'error'])(
    'rejects an early %s and removes all event handlers',
    async (event) => {
      const { resolver, socket } = setup();
      const pending = resolver.resolve('24422');
      const rejected = expect(pending).rejects.toMatchObject({ code: 'UPSTREAM' });
      await vi.advanceTimersByTimeAsync(0);
      socket.emit(event);
      await rejected;
      expectClean(socket);
    },
  );

  it('rejects send failures and cleans up the connected socket', async () => {
    const { resolver, socket } = setup();
    socket.send.mockImplementationOnce(() => {
      throw new Error('send failed');
    });
    const pending = resolver.resolve('24422');
    const rejected = expect(pending).rejects.toThrow('send failed');
    await vi.advanceTimersByTimeAsync(0);
    socket.open();
    await rejected;
    expectClean(socket);
  });

  it('rejects invalid input and pre-cancelled calls without touching the network', async () => {
    const { resolver, request, factory } = setup();
    await expect(resolver.resolve(' ')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const controller = new AbortController();
    controller.abort();
    await expect(resolver.resolve('24422', controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(request).not.toHaveBeenCalled();
    expect(factory).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
