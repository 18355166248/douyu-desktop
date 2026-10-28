import { describe, expect, it } from 'vitest';
import { parseRoomInput } from './roomInput';

describe('room input', () => {
  it.each([
    ['https://www.douyu.com/9999?dyshid=x', 'douyu', '9999'],
    ['live.bilibili.com/6', 'bilibili', '6'],
    ['https://m.live.bilibili.com/h5/123', 'bilibili', '123'],
    ['https://live.bilibili.com/blanc/123?live_from=share', 'bilibili', '123'],
    ['https://www.huya.com/abc123', 'huya', 'abc123'],
    ['https://www.douyu.com/topic/example?rid=12', 'douyu', '12'],
  ])('parses %s', (text, platform, roomId) => {
    expect(parseRoomInput(text!, 'douyu')).toEqual({ platform, roomId });
  });
  it('keeps the selected platform for a plain ID', () => {
    expect(parseRoomInput(' 123 ', 'bilibili')).toEqual({ platform: 'bilibili', roomId: '123' });
  });
  it.each([
    'https://evil.com/123',
    'https://www.douyu.com.evil.com/123',
    'https://live.bilibili.com/',
    'https://live.bilibili.com/unknown/123',
    'javascript:alert(1)',
    'https://user@huya.com/123',
  ])('rejects non-room input %s', (text) => {
    expect(() => parseRoomInput(text, 'douyu')).toThrow();
  });
});
