export interface RoomPkParticipant {
  roomId: string;
  name: string;
  score: number;
  rank: number;
}

export interface RoomPkSnapshot {
  source: 'live';
  roomId: string;
  pkId: string;
  phase: 'active' | 'finished';
  endsAt: number;
  fetchedAt: number;
  participants: RoomPkParticipant[];
}
