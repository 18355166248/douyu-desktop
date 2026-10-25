import type {
  DouyuAudienceUpdate,
  RoomAudienceRankEntry,
  RoomAudienceRanking,
} from '../contracts/audience';

/**
 * The official room client requests counters and current rankings from the
 * gateway, and subscribes to subsequent ranking changes on the barrage socket.
 */
export const DOUYU_AUDIENCE_SUBSCRIPTIONS: readonly string[] = [
  'type@=get/msgtype@=oni/',
  'type@=get/msgtype@=dfnum/',
  'type@=get/msgtype@=dayrk/',
  'type@=get/msgtype@=weekrk/',
  'type@=get/msgtype@=totalrk/',
  'type@=sub/mt@=dayrk/',
  'type@=sub/mt@=weekrk/',
  'type@=sub/mt@=totalrk/',
];

const RANK_TYPES: Readonly<Record<string, { key: RoomAudienceRanking['key']; label: string }>> = {
  dayrk: { key: 'day', label: '日活跃' },
  weekrk: { key: 'week', label: '周活跃' },
  totalrk: { key: 'total', label: '总活跃' },
};

// Decode exactly one STT layer. Reversing this replacement order would turn a
// literal "@S" inside a nickname into a slash too early.
function unescape(value: string): string {
  return value.replace(/@S/g, '/').replace(/@A/g, '@');
}

function fields(payload: string): Record<string, string> {
  const result: Record<string, string> = Object.create(null);
  for (const part of payload.split('/')) {
    const separator = part.indexOf('@=');
    if (separator <= 0) continue;
    result[part.slice(0, separator)] = unescape(part.slice(separator + 2));
  }
  return result;
}

function unsignedInteger(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

interface ParsedCount {
  value: number;
  isLowerBound: boolean;
  scaled: boolean;
}

const COUNT_UNITS: Readonly<Record<string, number>> = {
  万: 10_000,
  亿: 100_000_000,
};

/**
 * Douyu abbreviates large counters on the wire, for example `un@=1万` or
 * `un@=1.2万`. Only an explicit trailing "+" makes the value a lower bound;
 * a unit alone is the platform's display scale.
 */
function parseCount(value: string | undefined): ParsedCount | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  let count = trimmed;
  let isLowerBound = false;
  if (count.endsWith('+')) {
    isLowerBound = true;
    count = count.slice(0, -1);
  }

  const match = /^(\d+)(?:\.(\d+))?(万|亿)?$/.exec(count);
  if (!match) return null;
  const whole = match[1];
  const fraction = match[2] ?? '';
  const unit = match[3];
  if (whole === undefined) return null;

  const denominator = 10 ** fraction.length;
  const numerator = Number(whole) * denominator + Number(fraction || 0);
  const scale = unit ? (COUNT_UNITS[unit] ?? 1) : 1;
  const scaled = numerator * scale;
  if (!Number.isSafeInteger(scaled)) return null;
  const parsed = scaled / denominator;
  if (!Number.isSafeInteger(parsed)) return null;

  return { value: parsed, isLowerBound, scaled: Boolean(unit) };
}

function vipDescription(scaled: boolean): string {
  return scaled
    ? '斗鱼直播间贵宾人数，不代表全部在线观众；平台以“万/亿”为单位取整显示。'
    : '斗鱼直播间贵宾人数，不代表全部在线观众。';
}

function diamondFansDescription(scaled: boolean): string {
  return scaled
    ? '斗鱼直播间钻石粉丝人数，不代表当前在线人数；平台以“万/亿”为单位取整显示。'
    : '斗鱼直播间钻石粉丝人数，不代表当前在线人数。';
}

function rankingEntries(list: string): RoomAudienceRankEntry[] | null {
  if (!list) return [];
  const entries: RoomAudienceRankEntry[] = [];
  const rows = list.split('/').filter(Boolean);
  for (const [index, row] of rows.entries()) {
    const item = fields(unescape(row));
    if (!Object.hasOwn(item, 'nickname') && !Object.hasOwn(item, 'uid')) continue;

    // Hidden entries can carry encrypted identity fields (rl). Keep them
    // anonymous; this client does not attempt to decrypt the identity.
    const hidden = Number(item.ih) > 0;
    const gold = unsignedInteger(item.gold);
    const currentRank = unsignedInteger(item.crk);
    entries.push({
      rank: currentRank && currentRank > 0 ? currentRank : index + 1,
      userId: hidden ? '' : (item.uid ?? ''),
      nickname: hidden ? '神秘人' : item.nickname?.trim() || '匿名用户',
      // Official ChatRankServices.handleRankData divides raw gold by 100.
      contribution: gold === null ? null : gold / 100,
    });
  }
  // An absent/malformed list is not evidence that a previous ranking is empty.
  return rows.length > 0 && entries.length === 0 ? null : entries;
}

export function parseDouyuAudience(
  payload: string,
  roomId: string,
  now = Date.now(),
): DouyuAudienceUpdate | null {
  const data = fields(payload);
  const type = data.type;
  if (!type) return null;
  const sourceRoomId = data.rid ?? data.roomid;
  if (sourceRoomId && sourceRoomId !== roomId) return null;

  if (type === 'oni') {
    // "un" is the value used by the official 贵宾 tab. "vn" and "sum"
    // describe other counters and must not silently replace it.
    const parsed = parseCount(data.un);
    if (!parsed) return null;
    return {
      roomId,
      metrics: [
        {
          key: 'vip',
          label: '贵宾',
          value: parsed.value,
          ...(parsed.isLowerBound ? { isLowerBound: true } : {}),
          unit: '人',
          description: vipDescription(parsed.scaled),
        },
      ],
    };
  }

  if (type === 'dfnum' || type === 'dfansrk') {
    const parsed = parseCount(data.dfc);
    if (!parsed) return null;
    return {
      roomId,
      metrics: [
        {
          key: 'diamond-fans',
          label: '钻石粉丝',
          value: parsed.value,
          ...(parsed.isLowerBound ? { isLowerBound: true } : {}),
          unit: '人',
          description: diamondFansDescription(parsed.scaled),
        },
      ],
    };
  }

  const rank = Object.hasOwn(RANK_TYPES, type) ? RANK_TYPES[type] : undefined;
  if (!rank || data.list === undefined) return null;
  const entries = rankingEntries(data.list);
  if (entries === null) return null;
  return { roomId, ranking: { ...rank, entries, updatedAt: now } };
}
