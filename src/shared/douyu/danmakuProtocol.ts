import type { DanmakuMessage, DanmakuPosition } from '../contracts/danmaku';

const DOUYU_MESSAGE_TYPE = 689;
const PACKET_HEADER_SIZE = 12;
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder('utf-8');
const DEFAULT_COLOR = '#ffffff';
const DOUYU_COLOR_BY_INDEX: Readonly<Record<number, string>> = {
  1: '#ff0000',
  2: '#1e87f0',
  3: '#7ac84b',
  4: '#ff7f00',
  5: '#9b39f4',
  6: '#ff69b4',
  7: 'rainbow',
};

/**
 * Douyu STT packet:
 *   4 bytes little-endian length, 4 bytes length again, 4 bytes type,
 *   UTF-8 body, trailing NUL.
 */
export function encodeDouyuPacket(text: string): Uint8Array {
  const body = TEXT_ENCODER.encode(text);
  const length = body.length + 9;
  const packet = new Uint8Array(length + 4);
  const view = new DataView(packet.buffer);
  view.setUint32(0, length, true);
  view.setUint32(4, length, true);
  view.setUint32(8, DOUYU_MESSAGE_TYPE, true);
  packet.set(body, PACKET_HEADER_SIZE);
  return packet;
}

export function decodeDouyuPackets(data: Uint8Array): string[] {
  if (data.byteLength < PACKET_HEADER_SIZE) return [];

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const messages: string[] = [];
  let offset = 0;

  while (offset + PACKET_HEADER_SIZE <= data.byteLength) {
    const packetLength = view.getUint32(offset, true);
    const bodyLength = packetLength - 9;
    if (bodyLength < 0 || offset + packetLength + 4 > data.byteLength) break;

    const bodyStart = offset + PACKET_HEADER_SIZE;
    const text = TEXT_DECODER.decode(data.subarray(bodyStart, bodyStart + bodyLength));
    if (text.includes('type@=')) messages.push(text);
    offset += packetLength + 4;
  }

  if (messages.length > 0) return messages;

  // Be tolerant of proxies that strip framing; keep the STT payload only.
  const fallback = TEXT_DECODER.decode(data);
  for (const chunk of fallback.split('\0')) {
    const start = chunk.indexOf('type@=');
    if (start >= 0) messages.push(chunk.slice(start));
  }
  return messages;
}

function parseFields(payload: string): Record<string, string> {
  if (!payload.includes('type@=')) return {};
  return payload
    .split('/')
    .filter(Boolean)
    .reduce<Record<string, string>>((fields, part) => {
      const separator = part.indexOf('@=');
      if (separator <= 0) return fields;
      const key = part.slice(0, separator);
      const value = part
        .slice(separator + 2)
        .replace(/@S/g, '/')
        .replace(/@A/g, '@');
      fields[key] = value;
      return fields;
    }, {});
}

function toNumber(value: string | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function optionalText(value: string | undefined): string | undefined {
  return value && value.length > 0 ? value : undefined;
}

function toColor(value: string | undefined): string {
  const parsed = toNumber(value);
  if (parsed >= 1 && parsed <= 7) {
    return DOUYU_COLOR_BY_INDEX[parsed] ?? DEFAULT_COLOR;
  }
  // Older/proxied payloads occasionally carry a packed RGB value instead of
  // Douyu's small color index. Only values above the palette range are RGB.
  if (parsed <= 0 || parsed > 0xffffff || parsed < 0x100) return DEFAULT_COLOR;
  return `#${parsed.toString(16).padStart(6, '0')}`;
}

function hasMarker(value: string | undefined): boolean {
  return value !== undefined && value !== '' && value !== '0';
}

function toPosition(value: string | undefined): DanmakuPosition {
  if (value === 'top' || value === '1') return 'top';
  if (value === 'bottom' || value === '2') return 'bottom';
  return 'scroll';
}

function commonFields(fields: Record<string, string>, roomId: string) {
  return {
    platform: 'douyu' as const,
    roomId,
    userId: fields.uid ?? '',
    nickname: fields.nn ?? '匿名观众',
    color: DEFAULT_COLOR,
    level: toNumber(fields.level),
    badgeName: optionalText(fields.bnn),
    badgeLevel: optionalNumber(fields.bl),
    isNoble: toNumber(fields.nl) > 0,
    isRoomAdmin: fields.rg === '4',
    isSuper: fields.pg === '5',
  };
}

export function parseDouyuDanmaku(payload: string, roomId: string): DanmakuMessage | null {
  const fields = parseFields(payload);
  const type = fields.type;
  if (!type) return null;

  if (type === 'chatmsg' || type === 'hischatmsg') {
    const text = fields.txt ?? '';
    if (!text) return null;
    return {
      ...commonFields(fields, roomId),
      kind: 'chat',
      text,
      color: toColor(fields.col),
      hasDms: hasMarker(fields.dms),
      position: toPosition(fields.pos),
    };
  }

  if (type === 'uenter') {
    return {
      ...commonFields(fields, roomId),
      kind: 'enter',
      text: '进入了直播间',
    };
  }

  if (type === 'dgb') {
    const giftName = optionalText(fields.gfn);
    const giftCount = Math.max(1, toNumber(fields.gfcnt) || 1);
    return {
      ...commonFields(fields, roomId),
      kind: 'gift',
      text: giftName ? `送出 ${giftName} × ${giftCount}` : `送出礼物 × ${giftCount}`,
      giftName,
      giftCount,
    };
  }

  return null;
}
