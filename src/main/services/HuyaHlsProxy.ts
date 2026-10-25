import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { CHROME_UA } from '../constants';

export type HuyaPlaylistResolver = (roomId: string) => Promise<string[]>;

const UPSTREAM_TIMEOUT_MS = 7_000;
const SEGMENT_TIMEOUT_MS = 12_000;
const PLAYLIST_CACHE_MS = 7_000;
const PLAYLIST_STALE_MS = 20_000;
const TEMPLATE_TTL_MS = 30 * 60 * 1000;
const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

interface PlaylistCacheEntry {
  upstreamUrl: string;
  text: string;
  at: number;
}

function isAllowedSegmentHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === 'huya.com' ||
    host.endsWith('.huya.com') ||
    host === 'huyacdn.com' ||
    host.endsWith('.huyacdn.com') ||
    host.endsWith('.bytefcdnrd.com')
  );
}

export function isAllowedHuyaSegmentUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') && isAllowedSegmentHost(url.hostname)
    );
  } catch {
    return false;
  }
}

export function rewriteHuyaPlaylist(
  text: string,
  upstreamUrl: string,
  segmentUrlFor: (url: string) => string,
): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return line;
      const absolute = new URL(trimmed, upstreamUrl).toString();
      return segmentUrlFor(absolute);
    })
    .join('\n');
}

export interface HuyaPlaylistTemplate {
  firstUrl: string;
  prefix: string;
  suffix: string;
  firstSequence: number;
  firstTime: number;
  durationMs: number;
}

const HUYA_SEGMENT_PATTERN = /^(.*-)(\d{10,})-(\d{8}T\d{6})\.ts(\?.*)?$/;

function parseHuyaTimestamp(value: string): number | null {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  if (!year || !month || !day || !hour || !minute || !second) return null;
  return (
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ) -
    8 * 60 * 60 * 1000
  );
}

function formatHuyaTimestamp(ms: number): string {
  const date = new Date(ms + 8 * 60 * 60 * 1000);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
}

export function parseHuyaPlaylistTemplate(
  text: string,
  upstreamUrl: string,
): HuyaPlaylistTemplate | null {
  const segments = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => new URL(line, upstreamUrl).toString());

  const first = segments[0];
  const firstMatch = first ? HUYA_SEGMENT_PATTERN.exec(first) : null;
  if (!first || !firstMatch) return null;
  const prefix = firstMatch[1];
  const sequenceText = firstMatch[2];
  const timestampText = firstMatch[3];
  if (!prefix || !sequenceText || !timestampText) return null;
  const firstSequence = Number(sequenceText);
  const firstTime = parseHuyaTimestamp(timestampText);
  if (!Number.isFinite(firstSequence) || firstTime === null) return null;

  return {
    firstUrl: first,
    prefix,
    suffix: firstMatch[4] ?? '',
    firstSequence,
    firstTime,
    // Huya's segment names advance roughly every 4s even when EXTINF varies
    // (e.g. 5.000 / 2.703). Anchoring on the name timestamps avoids generating
    // URLs for segments that do not exist yet.
    durationMs: 4_000,
  };
}

export function renderHuyaPlaylist(template: HuyaPlaylistTemplate, now: number): string {
  const durationMs = template.durationMs;
  const elapsed = Math.max(0, now - template.firstTime);
  const latest = template.firstSequence + Math.floor(elapsed / durationMs);
  const start = Math.max(template.firstSequence, latest - 3);
  const lines = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    `#EXT-X-TARGETDURATION:${Math.ceil(durationMs / 1000)}`,
    `#EXT-X-MEDIA-SEQUENCE:${start}`,
  ];

  for (let sequence = start; sequence <= latest; sequence += 1) {
    const time = template.firstTime + (sequence - template.firstSequence) * durationMs;
    const url = `${template.prefix}${sequence}-${formatHuyaTimestamp(time)}.ts${template.suffix}`;
    lines.push(`#EXTINF:${(durationMs / 1000).toFixed(3)},`, url);
  }

  return lines.join('\n');
}

function playbackLineKey(url: string): string | null {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return null;
  }
}

export class HuyaHlsProxy {
  private readonly server = createServer((request, response) => {
    void this.handle(request, response);
  });

  private port: number | null = null;
  private readonly playlistCache = new Map<string, PlaylistCacheEntry>();
  private readonly playlistRequests = new Map<string, Promise<PlaylistCacheEntry>>();
  private readonly preferredLines = new Map<string, string>();
  private readonly templates = new Map<string, { template: HuyaPlaylistTemplate; at: number }>();

  constructor(private readonly resolvePlaylist: HuyaPlaylistResolver) {}

  async start(): Promise<void> {
    if (this.port !== null) return;

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => {
        this.server.off('error', onError);
        reject(error);
      };
      this.server.once('error', onError);
      this.server.listen(0, '127.0.0.1', () => {
        this.server.off('error', onError);
        const address = this.server.address();
        if (!address || typeof address === 'string') {
          reject(new Error('无法启动虎牙 HLS 代理'));
          return;
        }
        this.port = (address as AddressInfo).port;
        resolve();
      });
    });
  }

  stop(): void {
    if (this.port === null) return;
    this.port = null;
    this.playlistCache.clear();
    this.playlistRequests.clear();
    this.preferredLines.clear();
    this.templates.clear();
    this.server.close();
    this.server.closeAllConnections();
  }

  playlistUrl(roomId: string): string {
    if (this.port === null) throw new Error('虎牙 HLS 代理尚未启动');
    return `http://127.0.0.1:${this.port}/huya/${encodeURIComponent(roomId)}/playlist.m3u8`;
  }

  async prepare(roomId: string): Promise<void> {
    await this.getPlaylist(roomId);
  }

  private segmentUrl(upstreamUrl: string, roomId: string): string {
    if (this.port === null) throw new Error('虎牙 HLS 代理尚未启动');
    return `http://127.0.0.1:${this.port}/huya/segment?room=${encodeURIComponent(roomId)}&url=${encodeURIComponent(upstreamUrl)}`;
  }

  private upstreamHeaders(roomId: string): Record<string, string> {
    return {
      'User-Agent': CHROME_UA,
      Referer: `https://www.huya.com/${encodeURIComponent(roomId)}`,
      Origin: 'https://www.huya.com',
      Accept: '*/*',
    };
  }

  private corsHeaders(): Record<string, string> {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Private-Network': 'true',
      'Cache-Control': 'no-store',
    };
  }

  private fail(response: ServerResponse, status: number, message: string): void {
    if (response.headersSent) return;
    response.writeHead(status, {
      ...this.corsHeaders(),
      'Content-Type': 'text/plain; charset=utf-8',
    });
    response.end(message);
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      if (request.method === 'OPTIONS') {
        response.writeHead(204, this.corsHeaders());
        response.end();
        return;
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        this.fail(response, 405, 'Method Not Allowed');
        return;
      }

      const parsed = new URL(request.url ?? '/', 'http://127.0.0.1');
      const playlist = /^\/huya\/([^/]+)\/playlist\.m3u8$/.exec(parsed.pathname);
      if (playlist) {
        const encodedRoomId = playlist[1];
        if (!encodedRoomId) {
          this.fail(response, 400, 'Bad room id');
          return;
        }
        const roomId = decodeURIComponent(encodedRoomId);
        if (!ROOM_ID_PATTERN.test(roomId)) {
          this.fail(response, 400, 'Bad room id');
          return;
        }
        await this.servePlaylist(roomId, request.method, response);
        return;
      }

      if (parsed.pathname === '/huya/segment') {
        const upstreamUrl = parsed.searchParams.get('url');
        const roomId = parsed.searchParams.get('room');
        if (
          !upstreamUrl ||
          !roomId ||
          !ROOM_ID_PATTERN.test(roomId) ||
          !isAllowedHuyaSegmentUrl(upstreamUrl)
        ) {
          this.fail(response, 400, 'Bad segment url');
          return;
        }
        await this.serveSegment(upstreamUrl, roomId, request.method, response);
        return;
      }

      this.fail(response, 404, 'Not Found');
    } catch (error) {
      this.fail(response, 502, error instanceof Error ? error.message : '虎牙代理请求失败');
    }
  }

  private async fetchPlaylist(roomId: string): Promise<Omit<PlaylistCacheEntry, 'at'>> {
    const candidates = await this.resolvePlaylist(roomId);
    const preferred = this.preferredLines.get(roomId);
    const preferredCandidates = preferred
      ? candidates.filter((url) => playbackLineKey(url) === preferred)
      : [];
    // Stick to one CDN line: switching lines changes the media sequence and makes
    // hls.js treat the live edge as a huge backwards jump.
    const ordered = preferredCandidates.length > 0 ? preferredCandidates : candidates;

    let lastError: unknown = new Error('虎牙没有返回可用的 HLS 线路');
    for (const upstreamUrl of ordered) {
      try {
        const upstream = await fetch(upstreamUrl, {
          headers: this.upstreamHeaders(roomId),
          signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
          redirect: 'follow',
        });
        if (!upstream.ok) throw new Error(`虎牙 HLS 返回 ${upstream.status}`);
        const text = await upstream.text();
        if (!text.includes('#EXTM3U')) throw new Error('虎牙 HLS 返回了无效列表');
        const key = playbackLineKey(upstreamUrl);
        if (key) this.preferredLines.set(roomId, key);
        return { upstreamUrl, text };
      } catch (error) {
        lastError = error;
        // Once a line is selected, do not switch on refresh: a different CDN
        // returns a different media sequence and would stall the current player.
        // But if the selected line itself fails, drop it so the next attempt can
        // probe the remaining candidates instead of staying stuck forever.
        if (preferredCandidates.length > 0) {
          this.preferredLines.delete(roomId);
          break;
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error('虎牙 HLS 暂时不可用');
  }

  private getPlaylist(roomId: string): Promise<PlaylistCacheEntry> {
    const now = Date.now();
    const active = this.templates.get(roomId);
    if (active && now - active.at < TEMPLATE_TTL_MS) {
      return Promise.resolve({
        upstreamUrl: active.template.firstUrl,
        text: renderHuyaPlaylist(active.template, now),
        at: now,
      });
    }

    const cached = this.playlistCache.get(roomId);
    if (cached && now - cached.at < PLAYLIST_CACHE_MS) return Promise.resolve(cached);

    const pending = this.playlistRequests.get(roomId);
    if (pending) return pending;

    const request = this.fetchPlaylist(roomId)
      .then((result) => {
        const entry: PlaylistCacheEntry = { ...result, at: Date.now() };
        this.playlistCache.set(roomId, entry);
        const template = parseHuyaPlaylistTemplate(result.text, result.upstreamUrl);
        if (template) this.templates.set(roomId, { template, at: Date.now() });
        return entry;
      })
      .catch((error: unknown) => {
        const stale = this.playlistCache.get(roomId);
        if (stale && Date.now() - stale.at < PLAYLIST_STALE_MS) return stale;
        throw error;
      })
      .finally(() => {
        this.playlistRequests.delete(roomId);
      });

    this.playlistRequests.set(roomId, request);
    return request;
  }

  private async servePlaylist(
    roomId: string,
    method: string,
    response: ServerResponse,
  ): Promise<void> {
    const { upstreamUrl, text } = await this.getPlaylist(roomId);
    const body = Buffer.from(
      rewriteHuyaPlaylist(text, upstreamUrl, (url) => this.segmentUrl(url, roomId)),
      'utf8',
    );
    response.writeHead(200, {
      ...this.corsHeaders(),
      'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
      'Content-Length': String(body.byteLength),
    });
    if (method === 'HEAD') response.end();
    else response.end(body);
  }

  private async serveSegment(
    upstreamUrl: string,
    roomId: string,
    method: string,
    response: ServerResponse,
  ): Promise<void> {
    const template = this.templates.get(roomId);
    const cached = this.playlistCache.get(roomId);
    const upstream = await this.fetchSegmentWithRetry(upstreamUrl, roomId);
    if (!upstream.ok) {
      if (
        (upstream.status === 403 || upstream.status === 404) &&
        this.templates.get(roomId) === template &&
        this.playlistCache.get(roomId) === cached
      ) {
        // A 404 here has exhausted the publication grace period. A restarted
        // stream may have a new segment prefix; do not keep rolling the old one.
        // Late failures must not evict a template refreshed by another request.
        this.templates.delete(roomId);
        this.playlistCache.delete(roomId);
        this.preferredLines.delete(roomId);
      }
      await upstream.body?.cancel();
      this.fail(response, 502, `虎牙切片返回 ${upstream.status}`);
      return;
    }
    const body = Buffer.from(await upstream.arrayBuffer());
    response.writeHead(200, {
      ...this.corsHeaders(),
      'Content-Type': upstream.headers.get('content-type') ?? 'video/mp2t',
      'Content-Length': String(body.byteLength),
    });
    if (method === 'HEAD') response.end();
    else response.end(body);
  }

  private async fetchSegmentWithRetry(upstreamUrl: string, roomId: string): Promise<Response> {
    let latest: Response | null = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      latest = await fetch(upstreamUrl, {
        headers: this.upstreamHeaders(roomId),
        signal: AbortSignal.timeout(SEGMENT_TIMEOUT_MS),
        redirect: 'follow',
      });
      if (latest.ok || latest.status !== 404) return latest;
      // The rolling playlist can name the segment that just started. Huya
      // publishes it a moment later, so wait briefly instead of failing hls.js.
      if (attempt < 4) {
        void latest.body?.cancel();
        await sleep(1_000);
      }
    }
    return latest ?? new Response(null, { status: 404 });
  }
}
