import { AppError } from '../../errors';
import type { HttpClient } from '../../ports/HttpClient';

export interface FansBadgeRoom {
  roomId: string;
  name: string;
  level: number | null;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};

function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&([a-z]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match);
}

function textContent(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function readName(body: string): string | undefined {
  const anchor = /<a\b[^>]*class=["'][^"']*\banchor--name\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/i.exec(
    body,
  );
  if (anchor?.[1]) {
    const name = textContent(anchor[1]);
    if (name) return name;
  }

  const badge =
    /<div\b[^>]*class=["'][^"']*\bFansBadgeV4Name\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(body);
  if (badge?.[1]) {
    const name = textContent(badge[1]);
    if (name) return name;
  }

  const dataBn = /\bdata-bn=["']([^"']+)["']/i.exec(body)?.[1];
  return dataBn ? textContent(dataBn) : undefined;
}

function readLevel(openingTag: string): number | null {
  const raw = /\bdata-fans-level=["'](\d+)["']/i.exec(openingTag)?.[1];
  if (!raw) return null;
  const level = Number(raw);
  return Number.isFinite(level) ? level : null;
}

/**
 * Parses the authenticated `/member/cp/getFansBadgeList` page. Douyu has no
 * JSON fan-badge endpoint for this screen, so the HTML table is the source of
 * truth for which rooms can use the fan-club check-in.
 */
export function parseFansBadgeList(html: string): FansBadgeRoom[] {
  const rooms = new Map<string, FansBadgeRoom>();
  const rows = html.matchAll(/<tr\b[^>]*data-fans-room=["'](\d+)["'][^>]*>([\s\S]*?)<\/tr>/gi);
  for (const row of rows) {
    const openingTag = /^<tr\b[^>]*>/i.exec(row[0])?.[0] ?? row[0];
    const roomId = row[1]?.trim();
    if (!roomId || rooms.has(roomId)) continue;
    const body = row[2] ?? '';
    const name = readName(body) ?? `房间 ${roomId}`;
    rooms.set(roomId, { roomId, name, level: readLevel(openingTag) });
  }
  return [...rooms.values()];
}

export class FansBadgeQuery {
  constructor(private readonly http: HttpClient) {}

  async list(signal?: AbortSignal): Promise<FansBadgeRoom[]> {
    const response = await this.http.request({
      url: 'https://www.douyu.com/member/cp/getFansBadgeList',
      headers: { Referer: 'https://www.douyu.com/' },
      signal,
      retry: 'safe',
    });
    if (response.status !== 200) {
      throw new AppError('UPSTREAM', `粉丝团列表获取失败（HTTP ${response.status}）`);
    }
    return parseFansBadgeList(await response.text());
  }
}
