import { describe, expect, it } from 'vitest';
import {
  isAllowedHuyaSegmentUrl,
  parseHuyaPlaylistTemplate,
  renderHuyaPlaylist,
  rewriteHuyaPlaylist,
} from './HuyaHlsProxy';

describe('HuyaHlsProxy', () => {
  it('rewrites segment lines and keeps HLS directives', () => {
    const upstream = 'https://hs.hls.huya.com/src/master.m3u8?ratio=2000';
    const input = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-TARGETDURATION:4',
      'segment-1.ts',
      'https://hs.hls.huya.com/src/segment-2.ts?token=1',
      '#EXT-X-ENDLIST',
      '',
    ].join('\n');

    const output = rewriteHuyaPlaylist(input, upstream, (url) => `local?url=${encodeURIComponent(url)}`);
    const lines = output.split('\n');

    expect(lines[0]).toBe('#EXTM3U');
    expect(lines[1]).toBe('#EXT-X-VERSION:3');
    expect(lines[2]).toBe('#EXT-X-TARGETDURATION:4');
    expect(lines[3]).toBe(
      `local?url=${encodeURIComponent('https://hs.hls.huya.com/src/segment-1.ts')}`,
    );
    expect(lines[4]).toBe(
      `local?url=${encodeURIComponent('https://hs.hls.huya.com/src/segment-2.ts?token=1')}`,
    );
    expect(lines[5]).toBe('#EXT-X-ENDLIST');
  });

  it('only accepts Huya-controlled segment hosts', () => {
    expect(isAllowedHuyaSegmentUrl('https://hs.hls.huya.com/src/a.ts')).toBe(true);
    expect(isAllowedHuyaSegmentUrl('https://www.huya.com/a.ts')).toBe(true);
    expect(isAllowedHuyaSegmentUrl('https://evil.example/a.ts')).toBe(false);
    expect(isAllowedHuyaSegmentUrl('https://huya.com.evil.example/a.ts')).toBe(false);
    expect(isAllowedHuyaSegmentUrl('file:///etc/passwd')).toBe(false);
  });

  it('rolls a one-time Huya playlist forward without another master request', () => {
    const prefix =
      'https://hs.hls.huya.com/src/78941969-2559461593-10992803837303062528-2693342886-10057-A-0-1-imgplus_264-2000-ss-3064556580-';
    const suffix =
      '?volcDst=MTAuMTQ3Ljg1Ljk2&ratio=2000&wsSecret=e4b7e837ebd62c0041e75178ea43edc1&wsTime=6adedf48&fm=RFdxOEJjSjNoNkRKdDZUWV8kMF8kMV8kMl8kMw%3D%3D&ctype=tars_mp&fs=bgct&t=102';
    const text = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-TARGETDURATION:4',
      '#EXT-X-MEDIA-SEQUENCE:1792719590',
      '#EXTINF:4.000,',
      `${prefix}1792719590-20261025T130351.ts${suffix}`,
      '#EXTINF:4.000,',
      `${prefix}1792719591-20261025T130355.ts${suffix}`,
      '#EXTINF:4.000,',
      `${prefix}1792719592-20261025T130359.ts${suffix}`,
    ].join('\n');

    const template = parseHuyaPlaylistTemplate(text, prefix);
    expect(template).not.toBeNull();
    if (!template) return;

    const rolled = renderHuyaPlaylist(template, template.firstTime + 20_000);
    expect(rolled).toContain('#EXT-X-MEDIA-SEQUENCE:1792719592');
    expect(rolled).toContain(`${prefix}1792719595-20261025T130411.ts${suffix}`);
    expect(rolled).not.toContain('#EXT-X-ENDLIST');
  });

  it('returns null when the playlist has no Huya segment signature', () => {
    expect(parseHuyaPlaylistTemplate('#EXTM3U\n#EXT-X-ENDLIST', 'https://hs.hls.huya.com/')).toBeNull();
  });
});
