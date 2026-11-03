import { describe, expect, it } from 'vitest';
import type { RoomSearchItem } from '@shared/contracts/search';
import { searchRoomMeta, searchRoomSideText, stepSearchHighlight } from './homeSearch';

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

describe('room search formatting', () => {
  it('describes anchor and room hits with fans, category and loop state', () => {
    expect(
      searchRoomMeta(item({ roomId: '1', match: 'anchor', fansText: '1899.9万', category: 'DNF' })),
    ).toBe('主播 · 粉丝 1899.9万 · DNF');
    expect(searchRoomMeta(item({ roomId: '2', match: 'room' }))).toBe('直播间');
    expect(
      searchRoomMeta(item({ roomId: '3', match: 'room', isLive: false, hasVideo: true })),
    ).toBe('直播间 · 录像轮播');
    // 正在直播时不提示轮播，避免 LIVE 和「录像轮播」同时出现。
    expect(searchRoomMeta(item({ roomId: '4', hasVideo: true }))).toBe('主播');
  });

  it('prefers fans over category for the compact side text', () => {
    expect(searchRoomSideText(item({ roomId: '1', fansText: '1899.9万', category: 'DNF' }))).toBe(
      '1899.9万 粉丝',
    );
    expect(searchRoomSideText(item({ roomId: '2', category: 'DNF' }))).toBe('DNF');
    expect(searchRoomSideText(item({ roomId: '3' }))).toBeUndefined();
  });
});

describe('search dropdown highlight', () => {
  it('enters the list from either end', () => {
    expect(stepSearchHighlight(-1, 1, 3)).toBe(0);
    expect(stepSearchHighlight(-1, -1, 3)).toBe(2);
  });

  it('wraps around both ends', () => {
    expect(stepSearchHighlight(2, 1, 3)).toBe(0);
    expect(stepSearchHighlight(0, -1, 3)).toBe(2);
    expect(stepSearchHighlight(0, 1, 3)).toBe(1);
  });

  it('stays empty when there is nothing to select', () => {
    expect(stepSearchHighlight(-1, 1, 0)).toBe(-1);
    expect(stepSearchHighlight(2, 1, 0)).toBe(-1);
  });
});
