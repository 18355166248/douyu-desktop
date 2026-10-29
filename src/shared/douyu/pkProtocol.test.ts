import { describe, expect, it } from 'vitest';
import { parseDouyuPk } from './pkProtocol';

const stt = (data: Record<string, string | number>) =>
  Object.entries(data)
    .map(([key, value]) => `${key}@=${String(value).replace(/@/g, '@A').replace(/\//g, '@S')}/`)
    .join('');

export function pkFixture(): string {
  return stt({
    type: 'pkjt',
    cmd: 1,
    state: 2,
    drid: '4452132',
    pkid: '100259675',
    time: stt({ pk_end_time: 1793288473 }),
    teams: [stt({ team_id: '1', score: 9894.5 }), stt({ team_id: '2', score: 376 })]
      .map((entry) => entry.replace(/@/g, '@A').replace(/\//g, '@S'))
      .join('/'),
    participants: stt({
      '4452132': stt({
        rid: '4452132',
        team_id: 1,
        anchor: stt({ nickname: '测试主播/@S' }),
        pk_data: stt({ score: 9894, team_score: 9894.5 }),
      }),
      '52': stt({
        rid: '52',
        team_id: 2,
        anchor: stt({ nickname: '另一主播' }),
        pk_data: stt({ score: 376, team_score: 376 }),
      }),
    }),
  });
}

describe('observed Douyu PK join-room snapshot', () => {
  it('decodes nested participants, decimals and names without confusing contribution with team score', () => {
    const result = parseDouyuPk(pkFixture(), '4452132', 42);
    expect(result).toMatchObject({
      source: 'live',
      pkId: '100259675',
      phase: 'active',
      fetchedAt: 42,
      endsAt: 1793288473000,
      participants: [
        { roomId: '52', name: '另一主播', score: 376, rank: 2 },
        { roomId: '4452132', name: '测试主播/@S', score: 9894.5, rank: 1 },
      ],
    });
  });

  it('never accepts a different room or unrelated packet', () => {
    expect(parseDouyuPk(pkFixture(), '9999')).toBeNull();
    expect(parseDouyuPk('type@=chatmsg/txt@=pkjt/', '4452132')).toBeNull();
  });

  it('does not infer official settlement from a passed deadline', () => {
    expect(parseDouyuPk(pkFixture(), '4452132', 1793289000000)?.phase).toBe('active');
    expect(parseDouyuPk(pkFixture().replace('state@=2/', 'state@=3/'), '4452132')?.phase).toBe(
      'finished',
    );
  });

  it('rejects missing participant data rather than inventing scores', () => {
    expect(
      parseDouyuPk(
        stt({ type: 'pkjt', state: 2, drid: '4452132', pkid: 1, time: stt({ pk_end_time: 1 }) }),
        '4452132',
      ),
    ).toBeNull();
  });
});
