import { describe, expect, it } from 'vitest';
import { parseLegacyHistoryValue } from './LegacyDevHistoryMigration';

describe('parseLegacyHistoryValue', () => {
  it('defaults v1 entries without a platform to Douyu', () => {
    const entries = parseLegacyHistoryValue(
      JSON.stringify([{ roomId: '1126960', title: '旧版', anchorName: '主播', visitedAt: 1 }]),
    );

    expect(entries).toEqual([
      { platform: 'douyu', roomId: '1126960', title: '旧版', anchorName: '主播', visitedAt: 1 },
    ]);
  });

  it('keeps explicit platforms and ignores malformed payloads', () => {
    expect(
      parseLegacyHistoryValue(
        JSON.stringify([
          { platform: 'huya', roomId: '660000', title: '', anchorName: '', visitedAt: 2 },
        ]),
      ),
    ).toEqual([{ platform: 'huya', roomId: '660000', title: '', anchorName: '', visitedAt: 2 }]);
    expect(parseLegacyHistoryValue('{bad json')).toEqual([]);
    expect(parseLegacyHistoryValue(JSON.stringify({ entries: [] }))).toEqual([]);
    expect(parseLegacyHistoryValue(null)).toEqual([]);
  });
});
