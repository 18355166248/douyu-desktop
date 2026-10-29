import type { RoomPkSnapshot } from '../contracts/pk';

function fields(text: string): Record<string, string> {
  const result: Record<string, string> = Object.create(null);
  for (const part of text.split('/')) {
    const separator = part.indexOf('@=');
    if (separator > 0)
      result[part.slice(0, separator)] = part
        .slice(separator + 2)
        .replace(/@S/g, '/')
        .replace(/@A/g, '@');
  }
  return result;
}

function score(value: string | undefined): number | null {
  if (!value || !/^\d+(\.\d+)?$/.test(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Read the initial pkjt snapshot observed on the official room gateway. */
export function parseDouyuPk(
  payload: string,
  roomId: string,
  now = Date.now(),
): RoomPkSnapshot | null {
  const data = fields(payload);
  if (
    data.type !== 'pkjt' ||
    data.drid !== roomId ||
    !/^\d+$/.test(data.pkid ?? '') ||
    !['2', '3'].includes(data.state ?? '')
  )
    return null;
  const end = score(fields(data.time ?? '').pk_end_time);
  if (end === null) return null;
  const teams = (data.teams ?? '').split('/').filter(Boolean).map(fields);
  const rawParticipants = Object.values(fields(data.participants ?? ''));
  const participants = rawParticipants
    .map((value) => {
      const entry = fields(value);
      const anchor = fields(entry.anchor ?? '');
      const pk = fields(entry.pk_data ?? '');
      const team = teams.find((item) => item.team_id === entry.team_id);
      const points = score(team?.score) ?? score(pk.team_score) ?? score(pk.score);
      if (!/^\d{1,32}$/.test(entry.rid ?? '') || points === null) return null;
      return {
        roomId: entry.rid!,
        name: anchor.nickname?.trim().slice(0, 80) || `房间 ${entry.rid}`,
        score: points,
        rank: 0,
        slot: score(entry.slot) ?? 0,
      };
    })
    .filter((entry) => entry !== null)
    .sort((a, b) => a.slot - b.slot);
  if (
    participants.length < 2 ||
    participants.length > 8 ||
    participants.length !== rawParticipants.length ||
    new Set(participants.map((entry) => entry.roomId)).size !== participants.length
  )
    return null;
  return {
    source: 'live',
    roomId,
    pkId: data.pkid!,
    phase: data.state === '3' ? 'finished' : 'active',
    endsAt: end * 1000,
    fetchedAt: now,
    participants: participants.map((entry) => ({
      ...entry,
      rank: 1 + participants.filter((other) => other.score > entry.score).length,
    })),
  };
}
