import { describe, expect, it } from 'vitest';
import { filterHomeRooms } from './homeFilter';
const rooms = [
  { roomId: '1', name: 'Alice', title: '比赛直播', isLive: false },
  { roomId: '2', name: '小明', title: '音乐', isLive: true },
  { roomId: '3', name: 'Bob', title: '比赛解说', isLive: true },
];
describe('home room filters', () => {
  it('searches name, title and room ID without changing source order', () => {
    expect(filterHomeRooms(rooms, { query: ' ALICE ', onlyLive: false, liveFirst: true })).toEqual([
      rooms[0],
    ]);
    expect(filterHomeRooms(rooms, { query: '比赛', onlyLive: true, liveFirst: false })).toEqual([
      rooms[2],
    ]);
    expect(filterHomeRooms(rooms, { query: '2', onlyLive: false, liveFirst: false })).toEqual([
      rooms[1],
    ]);
    expect(rooms[0]?.name).toBe('Alice');
  });
  it('puts live rooms first while preserving their existing relative order', () => {
    expect(filterHomeRooms(rooms, { query: '', onlyLive: false, liveFirst: true })).toEqual([
      rooms[1],
      rooms[2],
      rooms[0],
    ]);
    expect(filterHomeRooms(rooms, { query: 'missing', onlyLive: false, liveFirst: true })).toEqual(
      [],
    );
  });
});
