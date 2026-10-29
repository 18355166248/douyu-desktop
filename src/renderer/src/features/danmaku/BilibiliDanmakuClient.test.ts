import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BILIBILI_OP_AUTH_REPLY,
  BILIBILI_OP_HEARTBEAT_REPLY,
  BILIBILI_OP_MESSAGE,
  encodeBilibiliPacket,
} from '@shared/bilibili/danmakuProtocol';
import { BilibiliDanmakuClient } from './BilibiliDanmakuClient';

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 0;
  binaryType = '';
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: ArrayBuffer }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = 3;
  });

  constructor(readonly url: string) {
    Socket.instances.push(this);
  }

  open(): void {
    this.readyState = Socket.OPEN;
    this.onopen?.();
  }

  receive(operation: number, body: string): void {
    this.onmessage?.({ data: encodeBilibiliPacket(operation, body) });
  }
}

let client: BilibiliDanmakuClient;
const onStatus = vi.fn();
const onEvent = vi.fn();
const refreshConfig = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('WebSocket', Socket);
  Socket.instances = [];
  onStatus.mockReset();
  onEvent.mockReset();
  refreshConfig.mockReset().mockResolvedValue({ host: 'new.example.test', token: 'new-token' });
  client = new BilibiliDanmakuClient({
    roomId: '1',
    host: 'old.example.test',
    token: 'old-token',
    refreshConfig,
    onStatus,
    onEvent,
  });
});

afterEach(() => {
  client.close();
  expect(vi.getTimerCount()).toBe(0);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function connect(): Socket {
  client.connect();
  const socket = Socket.instances[0]!;
  socket.open();
  return socket;
}

describe('Bilibili connection recovery', () => {
  it('times out a connection that never opens and refreshes its config', async () => {
    client.connect();
    const old = Socket.instances[0]!;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(old.close).toHaveBeenCalledOnce();
    expect(onStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'reconnecting',
        message: '弹幕连接超时',
      }),
    );
    await vi.advanceTimersByTimeAsync(3_000);
    expect(refreshConfig).toHaveBeenCalledOnce();
    const next = Socket.instances[1]!;
    expect(next.url).toBe('wss://new.example.test/sub');
    next.open();
    const auth = new TextDecoder().decode(new Uint8Array(next.send.mock.calls[0]![0]).slice(16));
    expect(JSON.parse(auth)).toMatchObject({ key: 'new-token', roomid: 1 });
  });

  it('retries when an open socket never replies to authentication', async () => {
    const socket = connect();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(socket.close).toHaveBeenCalledOnce();
    expect(onStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'reconnecting',
        message: '弹幕鉴权超时',
      }),
    );
    await vi.advanceTimersByTimeAsync(3_000);
    expect(Socket.instances).toHaveLength(2);
  });

  it.each(['{"code":-101}', '{}', 'invalid'])('rejects unsuccessful auth: %s', (reply) => {
    const socket = connect();
    socket.receive(BILIBILI_OP_AUTH_REPLY, reply);
    expect(socket.close).toHaveBeenCalledOnce();
    expect(onStatus).not.toHaveBeenCalledWith(expect.objectContaining({ status: 'connected' }));
    expect(onStatus).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'reconnecting' }));
  });

  it('replaces a half-open connection without waiting for onclose', async () => {
    const socket = connect();
    socket.receive(BILIBILI_OP_AUTH_REPLY, '{"code":0}');
    expect(onStatus).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'connected' }));
    await vi.advanceTimersByTimeAsync(59_000);
    expect(socket.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(socket.close).toHaveBeenCalledOnce();
    expect(socket.onmessage).toBeNull();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(Socket.instances).toHaveLength(2);
  });

  it('keeps a quiet room connected when heartbeat replies arrive', async () => {
    const socket = connect();
    socket.receive(BILIBILI_OP_AUTH_REPLY, '{"code":0}');
    for (let i = 0; i < 4; i += 1) {
      await vi.advanceTimersByTimeAsync(30_000);
      socket.receive(BILIBILI_OP_HEARTBEAT_REPLY, '');
    }
    expect(socket.close).not.toHaveBeenCalled();
    socket.receive(BILIBILI_OP_MESSAGE, JSON.stringify({ cmd: 'DANMU_MSG', info: [[], 'hello'] }));
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ text: 'hello' }));
  });

  it('ignores callbacks from an old socket and cancels scheduled retries on close', async () => {
    const socket = connect();
    const oldMessage = socket.onmessage!;
    const oldClose = socket.onclose!;
    socket.onerror?.();
    await vi.advanceTimersByTimeAsync(3_000);
    const next = Socket.instances[1]!;
    next.open();
    next.receive(BILIBILI_OP_AUTH_REPLY, '{"code":0}');
    onStatus.mockClear();
    oldClose();
    oldMessage({ data: encodeBilibiliPacket(BILIBILI_OP_AUTH_REPLY, '{"code":-101}') });
    expect(onStatus).not.toHaveBeenCalled();
    expect(next.close).not.toHaveBeenCalled();
    next.onerror?.();
    client.close();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(Socket.instances).toHaveLength(2);
  });

  it('does not open a socket if closed while refreshing config', async () => {
    let finish!: (config: { host: string; token: string }) => void;
    refreshConfig.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const socket = connect();
    socket.onerror?.();
    await vi.advanceTimersByTimeAsync(3_000);
    client.close();
    finish({ host: 'late.example.test', token: 'late-token' });
    await vi.advanceTimersByTimeAsync(0);
    expect(Socket.instances).toHaveLength(1);
    expect(onStatus).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'disconnected' }));
  });

  it('retries config failures and handles heartbeat send failures', async () => {
    refreshConfig.mockRejectedValueOnce(new Error('offline'));
    const socket = connect();
    socket.onerror?.();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(Socket.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(3_000);
    const next = Socket.instances[1]!;
    next.open();
    next.receive(BILIBILI_OP_AUTH_REPLY, '{"code":0}');
    next.send.mockImplementationOnce(() => {
      throw new Error('closed during send');
    });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(next.close).toHaveBeenCalledOnce();
    expect(onStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'reconnecting',
        message: '弹幕心跳发送失败',
      }),
    );
  });
});
