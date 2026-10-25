import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HuyaHlsProxy } from './HuyaHlsProxy';

const http = vi.hoisted(() => ({
  handler: null as ((request: IncomingMessage, response: ServerResponse) => void) | null,
}));
vi.mock('node:http', () => ({
  createServer: (handler: typeof http.handler) => {
    http.handler = handler;
    return {
      once: vi.fn(),
      off: vi.fn(),
      address: () => ({ port: 12345 }),
      listen: (_port: number, _host: string, ready: () => void) => ready(),
      close: vi.fn(),
      closeAllConnections: vi.fn(),
    };
  },
}));

const upstream = 'https://hs.hls.huya.com/live.m3u8';
const segment = 'https://hs.hls.huya.com/live-1792719590-20261025T130351.ts';
let proxy: HuyaHlsProxy;
const fetchUpstream = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.useFakeTimers();
  fetchUpstream.mockReset();
  vi.stubGlobal('fetch', fetchUpstream);
});
afterEach(() => {
  proxy?.stop();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function requestSegment(): Promise<number> {
  return new Promise((resolve) => {
    let status = 0;
    const response = {
      headersSent: false,
      writeHead: (value: number) => {
        status = value;
      },
      end: () => resolve(status),
    } as unknown as ServerResponse;
    http.handler?.(
      {
        method: 'GET',
        url: `/huya/segment?room=1&url=${encodeURIComponent(segment)}`,
      } as IncomingMessage,
      response,
    );
  });
}

describe('Huya expired segment recovery', () => {
  it('does not evict a refreshed template when an older segment request fails late', async () => {
    const resolver = vi.fn(async () => [upstream]);
    let finishOld!: (response: Response) => void;
    let segmentCalls = 0;
    fetchUpstream.mockImplementation(async (url) => {
      if (String(url) === upstream) return new Response(`#EXTM3U\n#EXTINF:4,\n${segment}\n`);
      segmentCalls += 1;
      if (segmentCalls === 1)
        return new Promise<Response>((resolve) => {
          finishOld = resolve;
        });
      return new Response(null, { status: 403 });
    });
    proxy = new HuyaHlsProxy(resolver);
    await proxy.start();
    await proxy.prepare('1');
    const old = requestSegment();
    expect(await requestSegment()).toBe(502);
    await proxy.prepare('1');
    finishOld(new Response(null, { status: 403 }));
    expect(await old).toBe(502);
    await proxy.prepare('1');
    expect(resolver).toHaveBeenCalledTimes(2);
  });

  it.each([403, 404])('refreshes the master after persistent HTTP %i', async (status) => {
    const resolver = vi.fn(async () => [upstream]);
    fetchUpstream.mockImplementation(async (url) =>
      String(url) === upstream
        ? new Response(`#EXTM3U\n#EXTINF:4,\n${segment}\n`)
        : new Response(null, { status }),
    );
    proxy = new HuyaHlsProxy(resolver);
    await proxy.start();
    await proxy.prepare('1');
    const response = requestSegment();
    await vi.advanceTimersByTimeAsync(4_000);
    expect(await response).toBe(502);
    await proxy.prepare('1');
    expect(resolver).toHaveBeenCalledTimes(2);
  });

  it('keeps the template when a newly published segment becomes available during retry', async () => {
    const resolver = vi.fn(async () => [upstream]);
    let segmentCalls = 0;
    fetchUpstream.mockImplementation(async (url) => {
      if (String(url) === upstream) return new Response(`#EXTM3U\n#EXTINF:4,\n${segment}\n`);
      segmentCalls += 1;
      return new Response(null, { status: segmentCalls < 3 ? 404 : 200 });
    });
    proxy = new HuyaHlsProxy(resolver);
    await proxy.start();
    await proxy.prepare('1');
    const response = requestSegment();
    await vi.advanceTimersByTimeAsync(4_000);
    expect(await response).toBe(200);
    await proxy.prepare('1');
    expect(resolver).toHaveBeenCalledTimes(1);
  });
});
