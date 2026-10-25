import { describe, expect, it } from 'vitest';
import { parseFansBadgeList } from './FansBadgeQuery';

const HTML = `
<table class="fans-badge-list">
  <tr data-fans-room="138243"
      data-fans-level="23"
      data-fans-intimacy="208612.8">
    <td><div class="FansBadgeV4Name">驴酱灬</div></td>
    <td><a href="/138243" class="anchor--name">洞主丨歌神洞庭湖</a></td>
  </tr>
  <tr data-fans-room="999" data-fans-level="7">
    <td><div class="FansBadgeV4Name">粉丝&amp;牌</div></td>
  </tr>
  <tr data-fans-room="138243" data-fans-level="23">
    <td><a href="/138243" class="anchor--name">重复房间</a></td>
  </tr>
  <tr data-fans-room="1000">
    <td><a href="javascript:void(0);" data-bn="备用名字">无</a></td>
  </tr>
</table>
`;

describe('parseFansBadgeList', () => {
  it('reads room ids, anchor names and levels from the fan badge table', () => {
    expect(parseFansBadgeList(HTML)).toEqual([
      { roomId: '138243', name: '洞主丨歌神洞庭湖', level: 23 },
      { roomId: '999', name: '粉丝&牌', level: 7 },
      { roomId: '1000', name: '备用名字', level: null },
    ]);
  });

  it('returns an empty list when the page has no fan badge rows', () => {
    expect(parseFansBadgeList('<table><tr><th>徽章</th></tr></table>')).toEqual([]);
  });
});
