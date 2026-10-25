import { describe, expect, it } from 'vitest';
import type { FollowedRoom } from '@shared/contracts/follow';
import type { RoomHistoryEntry } from '@shared/contracts/history';
import type { SpecialFollowEntry } from '@shared/contracts/specialFollow';
import {
  resolveSpecialRooms,
  sortFollowedRooms,
  specialFollowKey,
  targetFromFollowed,
  targetFromHistory,
} from './homeModel';

const room = (
  roomId: string,
  name: string,
  isLive: boolean,
  cover?: string,
): FollowedRoom => ({
  platform: 'douyu',
  roomId,
  name,
  title: `${name}的直播间`,
  isLive,
  isSpecial: false,
  ...(cover ? { cover } : {}),
});

const pinned = (roomId: string, addedAt: number): SpecialFollowEntry => ({
  platform: 'douyu',
  roomId,
  name: `旧名字 ${roomId}`,
  title: `旧标题 ${roomId}`,
  addedAt,
});

describe('homeModel', () => {
  it('puts live followed rooms first and keeps stable names', () => {
    const rooms = sortFollowedRooms([
      room('2', '乙', false),
      room('1', '甲', true),
      room('3', '丙', true),
    ]);
    expect(rooms.map((item) => item.roomId)).toEqual(['3', '1', '2']);
  });

  it('hydrates pinned rooms with fresh follow state', () => {
    expect(
      resolveSpecialRooms(
        [pinned('138243', 10)],
        [room('138243', '新名字', true, 'https://rpic.douyucdn.cn/cover.avif')],
      ),
    ).toEqual([
      {
        platform: 'douyu',
        roomId: '138243',
        name: '新名字',
        title: '新名字的直播间',
        cover: 'https://rpic.douyucdn.cn/cover.avif',
        addedAt: 10,
        isLive: true,
      },
    ]);
  });

  it('builds targets from follows and history with fallbacks', () => {
    expect(targetFromFollowed(room('1', '主播', true))).toMatchObject({
      roomId: '1',
      name: '主播',
      title: '主播的直播间',
    });
    const history: RoomHistoryEntry = {
      platform: 'bilibili',
      roomId: '6',
      title: '',
      anchorName: '',
      visitedAt: 1,
    };
    expect(targetFromHistory(history)).toMatchObject({
      platform: 'bilibili',
      roomId: '6',
      name: '房间 6',
      title: '房间 6',
    });
    expect(targetFromHistory(history, 'https://rpic.douyucdn.cn/cover.avif')).toMatchObject({
      cover: 'https://rpic.douyucdn.cn/cover.avif',
    });
    expect(specialFollowKey({ platform: 'huya', roomId: '9' })).toBe('huya:9');
  });
});
