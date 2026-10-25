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
  heat = 0,
): FollowedRoom => ({
  platform: 'douyu',
  roomId,
  name,
  title: `${name}的直播间`,
  isLive,
  isSpecial: false,
  hasVideo: false,
  heat,
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
  it('sorts followed rooms by heat, using live state and name for ties', () => {
    const rooms = sortFollowedRooms([
      room('2', '乙', false, undefined, 100),
      room('1', '甲', true, undefined, 300),
      room('3', '丙', true, undefined, 200),
    ]);
    expect(rooms.map((item) => item.roomId)).toEqual(['1', '3', '2']);
  });

  it('hydrates pinned rooms with fresh follow state and heat', () => {
    expect(
      resolveSpecialRooms(
        [pinned('138243', 10)],
        [room('138243', '新名字', true, 'https://rpic.douyucdn.cn/cover.avif', 88)],
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
        heat: 88,
        hasVideo: false,
        statusKnown: true,
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
