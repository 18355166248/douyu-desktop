import { describe, expect, it } from 'vitest';
import { DOUYU_AUDIENCE_SUBSCRIPTIONS, parseDouyuAudience } from './audienceProtocol';

function escape(value: string): string {
  return value.replace(/@/g, '@A').replace(/\//g, '@S');
}

function record(value: Record<string, string>): string {
  return Object.entries(value)
    .map(([key, value]) => `${key}@=${escape(value)}/`)
    .join('');
}

function ranking(type: string, rows: Record<string, string>[]): string {
  const list = rows.map((row) => `${escape(record(row))}/`).join('');
  return record({ type, rid: '9999', list });
}

describe('Douyu audience protocol', () => {
  it('uses oni.un for the official VIP count and preserves genuine zero', () => {
    expect(parseDouyuAudience('type@=oni/un@=123/vn@=888/sum@=900/', '9999')).toMatchObject({
      roomId: '9999',
      metrics: [{ key: 'vip', value: 123, unit: '人' }],
    });
    expect(parseDouyuAudience('type@=oni/un@=0/', '9999')?.metrics?.[0]?.value).toBe(0);
    expect(parseDouyuAudience('type@=oni/vn@=888/sum@=900/', '9999')).toBeNull();
  });

  it.each([
    ['1万', 10_000, false],
    ['1.2万', 12_000, false],
    ['123万', 1_230_000, false],
    ['1亿', 100_000_000, false],
    ['1万+', 10_000, true],
    ['9999+', 9_999, true],
  ])('parses the platform count abbreviation %s', (raw, value, isLowerBound) => {
    const metric = parseDouyuAudience(record({ type: 'oni', un: raw }), '9999')?.metrics?.[0];
    expect(metric).toMatchObject({ key: 'vip', value, unit: '人' });
    expect(metric?.isLowerBound).toBe(isLowerBound || undefined);
  });

  it.each(['dfnum', 'dfansrk'])('reads diamond-fan counts from %s.dfc', (type) => {
    expect(parseDouyuAudience(`type@=${type}/dfc@=105/`, '9999')).toMatchObject({
      metrics: [{ key: 'diamond-fans', value: 105, unit: '人' }],
    });
    expect(parseDouyuAudience(`type@=${type}/dfc@=1.5万/`, '9999')).toMatchObject({
      metrics: [{ key: 'diamond-fans', value: 15_000, unit: '人' }],
    });
  });

  it.each([
    ['dayrk', 'day', '日活跃'],
    ['weekrk', 'week', '周活跃'],
    ['totalrk', 'total', '总活跃'],
  ])('decodes the nested %s ranking and its contribution values', (type, key, label) => {
    const payload = ranking(type, [
      { uid: '42', nickname: '小鱼/@S@A', gold: '12345', icon: 'avatar' },
      { uid: '43', nickname: '另一条鱼', gold: '0' },
    ]);
    expect(parseDouyuAudience(payload, '9999', 1234)).toEqual({
      roomId: '9999',
      ranking: {
        key,
        label,
        updatedAt: 1234,
        entries: [
          { rank: 1, userId: '42', nickname: '小鱼/@S@A', contribution: 123.45 },
          { rank: 2, userId: '43', nickname: '另一条鱼', contribution: 0 },
        ],
      },
    });
  });

  it('keeps hidden users anonymous and does not decode encrypted identities', () => {
    const payload = ranking('dayrk', [
      { uid: '42', nickname: '隐身用户', ih: '1', rl: 'encrypted', gold: '100' },
    ]);
    expect(parseDouyuAudience(payload, '9999')?.ranking?.entries).toEqual([
      { rank: 1, userId: '', nickname: '神秘人', contribution: 1 },
    ]);
  });

  it('parses a literal wire payload and preserves ranks after a malformed row', () => {
    const payload = 'type@=weekrk/list@=broken@Suid@AA=7@ASnickname@AA=测试@ASgold@AA=155@AS@S/';
    expect(parseDouyuAudience(payload, '9999', 42)?.ranking).toEqual({
      key: 'week',
      label: '周活跃',
      updatedAt: 42,
      entries: [{ rank: 2, userId: '7', nickname: '测试', contribution: 1.55 }],
    });
  });

  it('reads the current rank and nested avatar escaping from the live gateway wire shape', () => {
    const payload =
      'type@=totalrk/rid@=9999/gid@=0/list@=uid@AA=42@AScrk@AA=5@ASlrk@AA=32767@ASrs@AA=0@ASnickname@AA=榜单用户@ASgold@AA=17435743500@ASlevel@AA=150@ASicon@AA=avatar_v3@AAS202111@AASavatar@ASpg@AA=1@ASrg@AA=1@AS@S/';
    expect(parseDouyuAudience(payload, '9999')?.ranking?.entries).toEqual([
      { rank: 5, userId: '42', nickname: '榜单用户', contribution: 174357435 },
    ]);
  });

  it('distinguishes an explicitly empty ranking from a missing or malformed list', () => {
    expect(parseDouyuAudience('type@=dayrk/list@=/', '9999')?.ranking?.entries).toEqual([]);
    expect(parseDouyuAudience('type@=dayrk/', '9999')).toBeNull();
    expect(parseDouyuAudience('type@=dayrk/list@=broken/', '9999')).toBeNull();
  });

  it.each(['', '-1', '12.5', 'NaN', 'Infinity', '9007199254740992', '1.2.3万', '万', '1万++'])(
    'rejects malformed counters and leaves invalid contribution %s unknown',
    (value) => {
      expect(parseDouyuAudience(record({ type: 'oni', un: value }), '9999')).toBeNull();
      expect(parseDouyuAudience(record({ type: 'dfnum', dfc: value }), '9999')).toBeNull();
      expect(
        parseDouyuAudience(ranking('dayrk', [{ uid: '1', nickname: '鱼', gold: value }]), '9999')
          ?.ranking?.entries[0]?.contribution,
      ).toBeNull();
    },
  );

  it('does not consume unrelated packets or updates for another room', () => {
    expect(parseDouyuAudience('type@=chatmsg/uid@=1/txt@=你好/', '9999')).toBeNull();
    expect(parseDouyuAudience('type@=constructor/list@=/', '9999')).toBeNull();
    expect(parseDouyuAudience('type@=oni/rid@=1/un@=12/', '9999')).toBeNull();
    expect(parseDouyuAudience('type@=dfnum/roomid@=1/dfc@=12/', '9999')).toBeNull();
    expect(parseDouyuAudience(ranking('dayrk', []), '2')).toBeNull();
  });

  it('requests initial values and subscribes to all three ranking updates', () => {
    expect(DOUYU_AUDIENCE_SUBSCRIPTIONS).toEqual([
      'type@=get/msgtype@=oni/',
      'type@=get/msgtype@=dfnum/',
      'type@=get/msgtype@=dayrk/',
      'type@=get/msgtype@=weekrk/',
      'type@=get/msgtype@=totalrk/',
      'type@=sub/mt@=dayrk/',
      'type@=sub/mt@=weekrk/',
      'type@=sub/mt@=totalrk/',
    ]);
  });
});
