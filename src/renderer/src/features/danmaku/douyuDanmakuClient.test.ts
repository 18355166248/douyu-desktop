import { describe, expect, it } from 'vitest';
import { buildDouyuVisitorLogin } from './douyuDanmakuClient';

describe('Douyu barrage login', () => {
  it('builds a visitor login without exposing account credentials', () => {
    const login = buildDouyuVisitorLogin('138243');

    expect(login).toContain('type@=loginreq/roomid@=138243/');
    expect(login).toContain('dfl@=sn@AA=105@ASss@AA=1/');
    expect(login).toMatch(/username@=visitor\d{7}\//u);
    expect(login).toMatch(/uid@=\d{9,10}\//u);
    expect(login).toContain('ver@=20220825/aver@=218101901/ct@=0/');
  });

  it('uses a different visitor id for each connection', () => {
    expect(buildDouyuVisitorLogin('138243')).not.toBe(buildDouyuVisitorLogin('138243'));
  });
});

