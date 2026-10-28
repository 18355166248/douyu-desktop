import type { StreamPlatform } from '@shared/contracts/stream';

/** Resolve only known room-page URLs. Short links require a network redirect and are rejected. */
export function parseRoomInput(
  input: string,
  fallback: StreamPlatform,
): { platform: StreamPlatform; roomId: string } {
  const text = input.trim();
  if (/^[a-zA-Z0-9_]{1,32}$/.test(text)) return { platform: fallback, roomId: text };
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    throw new Error('请输入房间号或完整的直播间链接');
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
    throw new Error('直播间链接不合法');
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);
  let platform: StreamPlatform;
  let roomId: string | undefined;
  if (['douyu.com', 'www.douyu.com', 'm.douyu.com'].includes(host)) {
    platform = 'douyu';
    roomId = parts[0] === 'topic' ? (url.searchParams.get('rid') ?? undefined) : parts[0];
  } else if (['live.bilibili.com', 'm.live.bilibili.com'].includes(host)) {
    platform = 'bilibili';
    roomId = parts[0] === 'h5' || parts[0] === 'blanc' ? parts[1] : parts[0];
  } else if (['huya.com', 'www.huya.com', 'm.huya.com'].includes(host)) {
    platform = 'huya';
    roomId = parts[0];
  } else throw new Error('仅支持斗鱼、B 站和虎牙的完整直播间链接');
  if (
    !roomId ||
    !/^[a-zA-Z0-9_]{1,32}$/.test(roomId) ||
    (platform === 'bilibili' && !/^\d+$/.test(roomId))
  ) {
    throw new Error('链接中未找到有效房间号，请打开直播间后复制完整链接');
  }
  return { platform, roomId };
}
