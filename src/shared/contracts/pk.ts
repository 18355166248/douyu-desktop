export interface RoomPkParticipant {
  roomId: string;
  name: string;
  score: number;
  rank: number;
  /** Distinguish a team's score from a participant's own contribution. */
  scoreKind: 'team' | 'participant';
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
