import { describe, expect, it } from 'vitest';
import { DEFAULT_DANMAKU_SETTINGS, parseDanmakuSettings } from './danmakuSettings';

describe('danmaku settings', () => {
  it('falls back to defaults for a non-object payload', () => {
    expect(parseDanmakuSettings(null)).toEqual(DEFAULT_DANMAKU_SETTINGS);
    expect(parseDanmakuSettings('broken')).toEqual(DEFAULT_DANMAKU_SETTINGS);
  });

  it('clamps sliders and keeps valid areas', () => {
    const parsed = parseDanmakuSettings({
      speed: 999,
      opacity: -10,
      fontScale: 20,
      density: 42,
      area: 'bottom',
    });

    expect(parsed).toMatchObject({
      speed: 200,
      opacity: 0,
      fontScale: 80,
      density: 10,
      area: 'bottom',
    });
  });

  it('accepts persisted booleans and ignores unknown areas', () => {
    const parsed = parseDanmakuSettings({
      visible: false,
      paused: true,
      area: 'somewhere',
      blockRole: true,
      simplified: true,
      showGift: false,
    });

    expect(parsed).toMatchObject({
      visible: false,
      paused: true,
      area: 'full',
      blockRole: true,
      simplified: true,
      showGift: false,
    });
  });

  it('uses defaults for missing fields and non-numeric values', () => {
    const parsed = parseDanmakuSettings({
      speed: 'fast',
      opacity: null,
      fontScale: undefined,
      blockLarge: 'yes',
    });

    expect(parsed.speed).toBe(DEFAULT_DANMAKU_SETTINGS.speed);
    expect(parsed.opacity).toBe(DEFAULT_DANMAKU_SETTINGS.opacity);
    expect(parsed.fontScale).toBe(DEFAULT_DANMAKU_SETTINGS.fontScale);
    expect(parsed.blockLarge).toBe(DEFAULT_DANMAKU_SETTINGS.blockLarge);
  });
});
