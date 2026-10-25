import type { DanmakuEvent } from '../contracts/danmaku';

export const BILIBILI_OP_HEARTBEAT = 2;
export const BILIBILI_OP_HEARTBEAT_REPLY = 3;
export const BILIBILI_OP_MESSAGE = 5;
export const BILIBILI_OP_AUTH = 7;
export const BILIBILI_OP_AUTH_REPLY = 8;

export const BILIBILI_HEADER_SIZE = 16;
export const BILIBILI_PROTOCOL_VERSION_PLAIN = 0;
export const BILIBILI_PROTOCOL_VERSION_ZLIB = 2;

export interface BilibiliPacket {
  operation: number;
  version: number;
  body: Uint8Array;
}

export interface BilibiliCommand {
  cmd?: string;
  info?: unknown;
  data?: unknown;
}

function readUint32(view: DataView, offset: number): number {
  return view.getUint32(offset, false);
}

export function decodeBilibiliPackets(buffer: ArrayBuffer): BilibiliPacket[] {
  const view = new DataView(buffer);
  const packets: BilibiliPacket[] = [];
  let offset = 0;

  while (offset + BILIBILI_HEADER_SIZE <= view.byteLength) {
    const packetLength = readUint32(view, offset);
    const headerLength = view.getUint16(offset + 4, false);
    const version = view.getUint16(offset + 6, false);
    const operation = readUint32(view, offset + 8);
    if (packetLength < BILIBILI_HEADER_SIZE || offset + packetLength > view.byteLength) break;

    const bodyStart = offset + headerLength;
    const bodyEnd = offset + packetLength;
    packets.push({
      operation,
      version,
      body: new Uint8Array(buffer, bodyStart, Math.max(0, bodyEnd - bodyStart)),
    });
    offset += packetLength;
  }

  return packets;
}

export function encodeBilibiliPacket(
  operation: number,
  body: string,
  version = BILIBILI_PROTOCOL_VERSION_PLAIN,
): ArrayBuffer {
  const payload = new TextEncoder().encode(body);
  const packetLength = BILIBILI_HEADER_SIZE + payload.length;
  const buffer = new ArrayBuffer(packetLength);
  const view = new DataView(buffer);
  view.setUint32(0, packetLength, false);
  view.setUint16(4, BILIBILI_HEADER_SIZE, false);
  view.setUint16(6, version, false);
  view.setUint32(8, operation, false);
  view.setUint32(12, 1, false);
  new Uint8Array(buffer, BILIBILI_HEADER_SIZE).set(payload);
  return buffer;
}

export function decodeBilibiliText(body: Uint8Array): BilibiliCommand | null {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(body));
    return typeof parsed === 'object' && parsed !== null ? (parsed as BilibiliCommand) : null;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function colorFromNumber(value: unknown): string {
  const color = asNumber(value, 0);
  if (color <= 0 || color > 0xffffff) return '#ffffff';
  return `#${color.toString(16).padStart(6, '0')}`;
}

function userInfo(info: unknown[]): {
  uid: string;
  nickname: string;
  isRoomAdmin: boolean;
} {
  const user = asArray(info[2]);
  return {
    uid: String(user[0] ?? ''),
    nickname: asString(user[1]),
    isRoomAdmin: asNumber(user[2]) === 1,
  };
}

function medalInfo(info: unknown[]): { badgeName?: string; badgeLevel?: number } {
  const medal = asArray(info[3]);
  const name = asString(medal[1]);
  const level = asNumber(medal[0]);
  return {
    ...(name ? { badgeName: name } : {}),
    ...(level > 0 ? { badgeLevel: level } : {}),
  };
}

function baseEvent(roomId: string, timestamp: number, suffix: string): Omit<DanmakuEvent, 'kind'> {
  return {
    id: `${roomId}-${timestamp}-${suffix}`,
    platform: 'bilibili',
    roomId,
    timestamp,
    userId: '',
    nickname: '',
    text: '',
    color: '#ffffff',
    level: 0,
    hasDms: true,
    position: 'scroll',
  };
}

export function parseBilibiliCommand(
  command: BilibiliCommand,
  roomId: string,
  timestamp = Date.now(),
): DanmakuEvent | null {
  const cmd = (command.cmd ?? '').split(':')[0] ?? '';

  if (cmd === 'DANMU_MSG') {
    const info = asArray(command.info);
    const text = asString(info[1]).trim();
    if (!text) return null;
    const user = userInfo(info);
    const medal = medalInfo(info);
    return {
      ...baseEvent(roomId, timestamp, `${user.uid}-${text.slice(0, 12)}`),
      kind: 'chat',
      text,
      userId: user.uid,
      nickname: user.nickname,
      color: colorFromNumber(asArray(info[0])[3]),
      level: asNumber(info[4]) || medal.badgeLevel || 0,
      isRoomAdmin: user.isRoomAdmin,
      ...medal,
    };
  }

  if (cmd === 'SEND_GIFT') {
    const data = asRecord(command.data);
    if (!data) return null;
    const user = asString(data.uname);
    const giftName = asString(data.giftName, '礼物');
    const count = asNumber(data.num, 1);
    return {
      ...baseEvent(roomId, timestamp, `${asString(data.uid)}-${giftName}-${count}`),
      kind: 'gift',
      userId: String(data.uid ?? ''),
      nickname: user,
      text: `送出 ${giftName} × ${count}`,
      giftName,
      giftCount: count,
    };
  }

  if (cmd === 'INTERACT_WORD') {
    const data = asRecord(command.data);
    if (!data) return null;
    if (asNumber(data.msg_type) !== 1) return null;
    const nickname = asString(data.uname);
    return {
      ...baseEvent(roomId, timestamp, `${asString(data.uid)}-enter`),
      kind: 'enter',
      userId: String(data.uid ?? ''),
      nickname,
      text: '进入了直播间',
    };
  }

  if (cmd === 'SUPER_CHAT_MESSAGE') {
    const data = asRecord(command.data);
    if (!data) return null;
    const text = asString(data.message).trim();
    if (!text) return null;
    return {
      ...baseEvent(roomId, timestamp, `${asString(data.uid)}-${text.slice(0, 12)}`),
      kind: 'chat',
      userId: String(data.uid ?? ''),
      nickname: asString(data.uname),
      text,
      isSuper: true,
    };
  }

  return null;
}
