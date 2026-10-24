import { describe, expect, it } from 'vitest';
import { decodeDouyuPackets, encodeDouyuPacket, parseDouyuDanmaku } from './danmakuProtocol';

describe('douyu danmaku protocol', () => {
  it('encodes a packet with the expected header and body', () => {
    const payload = 'type@=loginreq/roomid@=9999';
    const packet = encodeDouyuPacket(payload);
    const view = new DataView(packet.buffer);

    expect(view.getUint32(0, true)).toBe(packet.length - 4);
    expect(view.getUint32(4, true)).toBe(packet.length - 4);
    expect(view.getUint32(8, true)).toBe(689);
    expect(new TextDecoder().decode(packet.subarray(12, packet.length - 1))).toBe(payload);
  });

  it('decodes multiple packets from one websocket frame', () => {
    const first = encodeDouyuPacket('type@=chatmsg/nn@=A/txt@=one/');
    const second = encodeDouyuPacket('type@=uenter/nn@=B/');
    const combined = new Uint8Array(first.length + second.length);
    combined.set(first);
    combined.set(second, first.length);

    expect(decodeDouyuPackets(combined)).toEqual([
      'type@=chatmsg/nn@=A/txt@=one/',
      'type@=uenter/nn@=B/',
    ]);
  });

  it('parses a chat message including color, badge and admin flags', () => {
    const message = parseDouyuDanmaku(
      'type@=chatmsg/rid@=9999/uid@=123/nn@=Alice/txt@=hello@Sworld/col@=16711680/level@=20/bnn@=小僵尸/bl@=12/nl@=3/rg@=4/pg@=5/',
      '9999',
    );

    expect(message).toMatchObject({
      platform: 'douyu',
      roomId: '9999',
      kind: 'chat',
      userId: '123',
      nickname: 'Alice',
      text: 'hello/world',
      color: '#ff0000',
      level: 20,
      badgeName: '小僵尸',
      badgeLevel: 12,
      isNoble: true,
      isRoomAdmin: true,
      isSuper: true,
    });
  });

  it('maps Douyu color indexes to the colors used by the website', () => {
    const colors: Array<[number, string]> = [
      [1, '#ff0000'],
      [2, '#1e87f0'],
      [3, '#7ac84b'],
      [4, '#ff7f00'],
      [5, '#9b39f4'],
      [6, '#ff69b4'],
      [7, 'rainbow'],
    ];

    for (const [index, color] of colors) {
      const message = parseDouyuDanmaku(
        `type@=chatmsg/uid@=123/nn@=Alice/txt@=hello/col@=${index}/`,
        '9999',
      );
      expect(message?.color).toBe(color);
    }

    expect(parseDouyuDanmaku('type@=chatmsg/uid@=123/nn@=Alice/txt@=hello/', '9999')?.color).toBe(
      '#ffffff',
    );
    expect(
      parseDouyuDanmaku('type@=chatmsg/uid@=123/nn@=Alice/txt@=hello/col@=8/', '9999')?.color,
    ).toBe('#ffffff');
    expect(
      parseDouyuDanmaku('type@=chatmsg/uid@=123/nn@=Alice/txt@=hello/col@=16711680/', '9999')
        ?.color,
    ).toBe('#ff0000');
    expect(
      parseDouyuDanmaku('type@=chatmsg/uid@=123/nn@=Alice/txt@=hello/col@=65535/', '9999')?.color,
    ).toBe('#00ffff');
  });

  it('parses enter and gift messages', () => {
    expect(parseDouyuDanmaku('type@=uenter/uid@=1/nn@=Bob/level@=10/', '9999')).toMatchObject({
      kind: 'enter',
      userId: '1',
      nickname: 'Bob',
      text: '进入了直播间',
      level: 10,
    });

    expect(
      parseDouyuDanmaku('type@=dgb/uid@=2/nn@=Carol/gfcnt@=3/gfn@=火箭/', '9999'),
    ).toMatchObject({
      kind: 'gift',
      userId: '2',
      nickname: 'Carol',
      text: '送出 火箭 × 3',
      giftName: '火箭',
      giftCount: 3,
    });
  });

  it('exposes the dms marker and fixed-position kind for filtering', () => {
    const message = parseDouyuDanmaku(
      'type@=chatmsg/uid@=123/nn@=Alice/txt@=hello/dms@=4/pos@=2/',
      '9999',
    );

    expect(message).toMatchObject({
      hasDms: true,
      position: 'bottom',
    });
  });

  it('treats missing dms and pos as a plain scrolling robot message', () => {
    const message = parseDouyuDanmaku('type@=chatmsg/uid@=123/nn@=Alice/txt@=hello/', '9999');

    expect(message).toMatchObject({
      hasDms: false,
      position: 'scroll',
    });
  });

  it('drops empty badge levels instead of exposing zero', () => {
    const message = parseDouyuDanmaku(
      'type@=chatmsg/uid@=123/nn@=Alice/txt@=hello/bnn@=/bl@=0/',
      '9999',
    );

    expect(message?.badgeName).toBeUndefined();
    expect(message?.badgeLevel).toBeUndefined();
  });

  it('ignores unknown or empty messages', () => {
    expect(parseDouyuDanmaku('type@=loginres/userid@=0/', '9999')).toBeNull();
    expect(parseDouyuDanmaku('not-a-packet', '9999')).toBeNull();
    expect(decodeDouyuPackets(new Uint8Array())).toEqual([]);
  });
});
