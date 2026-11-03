import { describe, expect, it } from 'vitest';
import type { RoomSearchItem } from '@shared/contracts/search';
import { excludeKnownRooms, searchRoomMeta } from './homeSearch';

function item(patch: Partial<RoomSearchItem> & Pick<RoomSearchItem, 'roomId'>): RoomSearchItem {
  return {
    platform: 'douyu',
    name: `主播${patch.roomId}`,
    title: `房间${patch.roomId}`,
    isLive: true,
    hasVideo: false,
    heat: 0,
    match: 'anchor',
    ...patch,
  };
}

describe('home search results', () => {
  it('drops rooms that are already shown and keeps upstream order', () => {
    const items = [item({ roomId: '1' }), item({ roomId: '2' }), item({ roomId: '3' })];
    const known = [
      { platform: 'douyu' as const, roomId: '2' },
      { platform: 'bilibili' as const, roomId: '1' },
    ];
    expect(excludeKnownRooms(items, known).map((entry) => entry.roomId)).toEqual(['1', '3']);
    expect(excludeKnownRooms(items, [])).toEqual(items);
  });

  it('describes anchor and room hits with fans, category and loop state', () => {
    expect(
      searchRoomMeta(
        item({ roomId: '1', match: 'anchor', fansText: '1899.9万', category: 'DNF' }),
      ),
    ).toBe('主播 · 粉丝 1899.9万 · DNF');
    expect(searchRoomMeta(item({ roomId: '2', match: 'room' }))).toBe('直播间');
    expect(
      searchRoomMeta(item({ roomId: '3', match: 'room', isLive: false, hasVideo: true })),
    ).toBe('直播间 · 录像轮播');
    // 正在直播时不提示轮播，避免 LIVE 和「录像轮播」同时出现。
    expect(searchRoomMeta(item({ roomId: '4', hasVideo: true }))).toBe('主播');
  });
});
