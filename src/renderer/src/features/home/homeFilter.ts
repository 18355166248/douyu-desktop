export interface HomeFilter {
  query: string;
  onlyLive: boolean;
  liveFirst: boolean;
}
interface SearchableRoom {
  roomId: string;
  name: string;
  title: string;
  isLive: boolean;
}
export function filterHomeRooms<T extends SearchableRoom>(rooms: T[], filter: HomeFilter): T[] {
  const query = filter.query.trim().toLocaleLowerCase();
  const filtered = rooms.filter(
    (room) =>
      (!filter.onlyLive || room.isLive) &&
      (!query || `${room.name}\n${room.title}\n${room.roomId}`.toLocaleLowerCase().includes(query)),
  );
  return filter.liveFirst
    ? filtered.sort((left, right) => Number(right.isLive) - Number(left.isLive))
    : filtered;
}
