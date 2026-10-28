import { describe, expect, it, vi } from 'vitest';
import { buildDouyuVisitorLogin, DouyuDanmakuClient } from './douyuDanmakuClient';

describe('Douyu barrage login', () => {
  it('builds a visitor login without exposing account credentials', () => {
    const login = buildDouyuVisitorLogin('138243');

    expect(login).toContain('type@=loginreq/roomid@=138243/');
    expect(login).toContain('dfl@=sn@AA=105@ASss@AA=1/');
    expect(login).toMatch(/username@=visitor\d{7}\//u);
    expect(login).toMatch(/uid@=\d{9,10}\//u);
    expect(login).toContain('ver@=20220825/aver@=218101901/ct@=0/');
  });

  it('uses a different visitor id for each connection', () => {
    expect(buildDouyuVisitorLogin('138243')).not.toBe(buildDouyuVisitorLogin('138243'));
  });
});

describe('Douyu connection liveness', () => {
  it('replaces a half-open socket and cancels reconnect on close', async () => {
    vi.useFakeTimers();
    class Socket {
      static OPEN = 1;
      static instances: Socket[] = [];
      readyState = 1;
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: ArrayBuffer }) => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: (() => void) | null = null;
      send = vi.fn();
      close = vi.fn();
      constructor() {
        Socket.instances.push(this);
      }
    }
    vi.stubGlobal('WebSocket', Socket);
    vi.stubGlobal('window', globalThis);
    const client = new DouyuDanmakuClient({
      roomId: '1',
      host: 'example.test',
      onEvent: vi.fn(),
      onStatus: vi.fn(),
    });
    try {
      client.connect();
      const socket = Socket.instances[0]!;
      socket.onopen?.();
      vi.advanceTimersByTime(60_000);
      expect(socket.close).toHaveBeenCalledOnce();
      expect(socket.onmessage).toBeNull();
      vi.advanceTimersByTime(3_000);
      expect(Socket.instances).toHaveLength(2);
      Socket.instances[1]!.onerror?.();
      client.close();
      vi.advanceTimersByTime(30_000);
      expect(Socket.instances).toHaveLength(2);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      client.close();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});
