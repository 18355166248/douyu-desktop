import { describe, expect, it } from 'vitest';
import {
  BILIBILI_OP_AUTH,
  decodeBilibiliPackets,
  decodeBilibiliText,
  encodeBilibiliPacket,
  parseBilibiliCommand,
} from './danmakuProtocol';

describe('Bilibili danmaku protocol', () => {
  it('encodes and decodes a packet payload', () => {
    const packet = encodeBilibiliPacket(BILIBILI_OP_AUTH, '{"roomid":1}');
    const decoded = decodeBilibiliPackets(packet);

    expect(decoded).toHaveLength(1);
    expect(decoded[0]?.operation).toBe(BILIBILI_OP_AUTH);
    expect(decodeBilibiliText(decoded[0]?.body ?? new Uint8Array())).toEqual({ roomid: 1 });
  });

  it('parses a DANMU_MSG with color, medal and admin flag', () => {
    const event = parseBilibiliCommand(
      {
        cmd: 'DANMU_MSG:4:0:2:2:2:0',
        info: [
          [0, 1, 25, 16711680, 1790000000000],
          '你好 B 站',
          ['42', '观众甲', 1],
          [12, '粉丝牌', '主播'],
          18,
        ],
      },
      '7734200',
      1234,
    );

    expect(event).toMatchObject({
      platform: 'bilibili',
      roomId: '7734200',
      kind: 'chat',
      userId: '42',
      nickname: '观众甲',
      text: '你好 B 站',
      color: '#ff0000',
      level: 18,
      badgeName: '粉丝牌',
      badgeLevel: 12,
      isRoomAdmin: true,
      hasDms: true,
    });
  });

  it('parses gifts and enter messages, ignoring other interactions', () => {
    expect(
      parseBilibiliCommand(
        { cmd: 'SEND_GIFT', data: { uid: 7, uname: '送礼人', giftName: '辣条', num: 3 } },
        '1',
        100,
      ),
    ).toMatchObject({
      kind: 'gift',
      text: '送出 辣条 × 3',
      giftName: '辣条',
      giftCount: 3,
    });

    expect(
      parseBilibiliCommand(
        { cmd: 'INTERACT_WORD', data: { uid: 8, uname: '进场人', msg_type: 1 } },
        '1',
        100,
      ),
    ).toMatchObject({ kind: 'enter', text: '进入了直播间' });

    expect(
      parseBilibiliCommand(
        { cmd: 'INTERACT_WORD', data: { uid: 8, uname: '关注人', msg_type: 2 } },
        '1',
        100,
      ),
    ).toBeNull();
  });

  it('parses super chat as a highlighted chat message', () => {
    const event = parseBilibiliCommand(
      { cmd: 'SUPER_CHAT_MESSAGE', data: { uid: 9, uname: '醒目留言', message: '加油' } },
      '1',
      100,
    );

    expect(event).toMatchObject({ kind: 'chat', text: '加油', isSuper: true });
  });
});
