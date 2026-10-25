import { describe, expect, it } from 'vitest';
import {
  MAX_ROOM_HISTORY,
  formatHistoryTime,
  parseRoomHistory,
  removeRoomHistory,
  upsertRoomHistory,
} from './roomHistory';

const t = (hour: number): number => new Date(2026, 9, 24, hour, 0).getTime();

describe('room history', () => {
  it('sorts newest first, deduplicates rooms and drops invalid entries', () => {
    const parsed = parseRoomHistory([
      { roomId: '222', title: '旧标题', anchorName: 'B', visitedAt: t(20) },
      { roomId: '111', title: '新标题', anchorName: 'A', visitedAt: t(22) },
      { roomId: '222', title: '最新标题', anchorName: 'B', visitedAt: t(23) },
      { roomId: '', title: '空房间', anchorName: '', visitedAt: t(21) },
      null,
      { roomId: '333', visitedAt: 'not-a-number' },
    ]);

    expect(parsed.map((entry) => entry.roomId)).toEqual(['222', '111']);
    expect(parsed[0]?.title).toBe('最新标题');
    expect(parsed[0]?.visitedAt).toBe(t(23));
  });

  it('moves an existing room back to the top and updates its title', () => {
    const entries = parseRoomHistory([
      { roomId: '111', title: '旧标题', anchorName: 'A', visitedAt: t(20) },
      { roomId: '222', title: '另一个房间', anchorName: 'B', visitedAt: t(21) },
    ]);

    const next = upsertRoomHistory(
      entries,
      { roomId: '111', title: '新标题', anchorName: 'A' },
      t(23),
    );

    expect(next.map((entry) => entry.roomId)).toEqual(['111', '222']);
    expect(next[0]).toMatchObject({ title: '新标题', visitedAt: t(23) });
  });

  it('caps the list at the configured maximum', () => {
    const raw = Array.from({ length: MAX_ROOM_HISTORY + 5 }, (_, index) => ({
      roomId: String(index + 1),
      title: `房间 ${index + 1}`,
      anchorName: '',
      visitedAt: t(1) + index,
    }));

    const parsed = parseRoomHistory(raw);
    expect(parsed).toHaveLength(MAX_ROOM_HISTORY);
    expect(parsed[0]?.roomId).toBe(String(MAX_ROOM_HISTORY + 5));
  });

  it('keeps the same room id from different platforms separately', () => {
    const entries = parseRoomHistory([
      { platform: 'douyu', roomId: '6', title: '斗鱼', anchorName: '', visitedAt: t(20) },
      { platform: 'bilibili', roomId: '6', title: 'B站', anchorName: '', visitedAt: t(21) },
      { roomId: '6', title: '旧版本记录', anchorName: '', visitedAt: t(22) },
    ]);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ platform: 'douyu', title: '旧版本记录' });
    expect(entries[1]).toMatchObject({ platform: 'bilibili', title: 'B站' });
  });

  it('formats local date and time and rejects invalid timestamps', () => {
    expect(formatHistoryTime(new Date(2026, 9, 24, 23, 39).getTime())).toBe('2026-10-24 23:39');
    expect(formatHistoryTime(0)).toBe('');
    expect(formatHistoryTime(Number.NaN)).toBe('');
  });

  it('removes one or many entries by platform-scoped room key', () => {
    const entries = parseRoomHistory([
      { platform: 'douyu', roomId: '6', title: '斗鱼', anchorName: '', visitedAt: t(20) },
      { platform: 'bilibili', roomId: '6', title: 'B站', anchorName: '', visitedAt: t(21) },
      { platform: 'douyu', roomId: '111', title: '另一个', anchorName: '', visitedAt: t(22) },
    ]);

    expect(removeRoomHistory(entries, ['bilibili:6']).map((entry) => entry.roomId)).toEqual([
      '111',
      '6',
    ]);
    expect(removeRoomHistory(entries, ['bilibili:6', 'douyu:111'])).toHaveLength(1);
    expect(removeRoomHistory(entries, ['douyu:6', 'douyu:111'])).toHaveLength(1);
    expect(removeRoomHistory(entries, [])).toEqual(entries);
  });
});
